# GoModParser 模块解析器设计

## 修订记录
| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0  | 2026-03-20 | DEV | 基于v0.2.5源码重构解析器模块文档 |

## 1. 模块概述

### 1.1 职责定义
GoModParser负责解析Go项目的依赖信息，是扩展的数据来源层。主要功能包括：
- 执行`go list`命令获取模块依赖
- 解析标准库依赖
- 计算依赖包的本地源码路径
- 处理go.mod的replace指令
- 支持vendor目录优先策略

### 1.2 技术架构
```typescript
class GoModParser {
  constructor(private config: ConfigManager) {}
  
  // 主要API
  async parseDependencies(projectRoot: string): Promise<DependencyInfo[]>
  async parseStdlibDeps(projectRoot: string): Promise<DependencyInfo[]>
  getSourcePath(dep: DependencyInfo, projectRoot: string): string
  getStdlibSourcePath(pkgPath: string): string
}
```

## 2. 核心解析逻辑

### 2.1 模块依赖解析

#### 主入口方法
```typescript
async parseDependencies(projectRoot: string): Promise<DependencyInfo[]> {
  const deps = await this.runGoList(projectRoot);
  outputChannel.appendLine(
    `[${projectRoot}] Loaded ${deps.length} dependencies ` +
    `(${deps.filter(d => !d.indirect).length} direct, ` +
    `${deps.filter(d => d.indirect).length} indirect)`
  );
  return deps;
}
```

#### go list 命令执行
```typescript
private runGoList(cwd: string): Promise<DependencyInfo[]> {
  return new Promise((resolve, reject) => {
    exec('go list -m -json all', { 
      cwd, 
      maxBuffer: 10 * 1024 * 1024 
    }, (error, stdout, _stderr) => {
      if (error) {
        // 降级到go.mod直接解析
        outputChannel.appendLine(`[WARN] go list failed: ${error.message}, using go.mod fallback`);
        this.parseGoModFallback(cwd).then(resolve).catch(reject);
        return;
      }
      
      try {
        const modules = parseJsonStream(stdout);
        const deps: DependencyInfo[] = [];
        
        for (const mod of modules) {
          if (mod.Main) continue; // 跳过主模块
          
          const dep: DependencyInfo = {
            path: mod.Path,
            version: mod.Version || '',
            indirect: mod.Indirect === true,
            dir: mod.Dir,
            goVersion: mod.GoVersion,
          };
          
          // 处理replace信息
          if (mod.Replace) {
            dep.replace = {
              path: mod.Replace.Path,
              version: mod.Replace.Version,
              dir: mod.Replace.Dir,
            };
          }
          
          deps.push(dep);
        }
        
        resolve(deps);
      } catch (e) {
        reject(e);
      }
    });
  });
}
```

### 2.2 JSON流解析

go list输出是多个JSON对象的串联，需要特殊解析：

```typescript
// 来自 pure.ts
export function parseJsonStream(text: string): any[] {
  const results: any[] = [];
  let depth = 0;
  let start = -1;
  
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    }
    if (text[i] === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        results.push(JSON.parse(text.slice(start, i + 1)));
        start = -1;
      }
    }
  }
  
  return results;
}
```

**输出格式示例**：
```json
{"Path":"github.com/gin-gonic/gin","Version":"v1.9.1","Dir":"/Users/user/go/pkg/mod/github.com/gin-gonic/gin@v1.9.1"}
{"Path":"gopkg.in/yaml.v3","Version":"v3.0.1","Indirect":true,"Dir":"/Users/user/go/pkg/mod/gopkg.in/yaml.v3@v3.0.1"}
```

### 2.3 go.mod 降级解析

当`go list`命令失败时，直接解析go.mod文件：

```typescript
private async parseGoModFallback(projectRoot: string): Promise<DependencyInfo[]> {
  const goModPath = path.join(projectRoot, 'go.mod');
  if (!fs.existsSync(goModPath)) return [];
  
  const content = fs.readFileSync(goModPath, 'utf8');
  return parseGoModText(content);
}

// 来自 pure.ts 的正则表达式解析
export function parseGoModText(content: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  const lines = content.split('\n');
  let insideRequireBlock = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // require 块开始
    if (line.startsWith('require (')) {
      insideRequireBlock = true;
      continue;
    }
    
    // require 块结束
    if (insideRequireBlock && line === ')') {
      insideRequireBlock = false;
      continue;
    }
    
    // require 块内的依赖
    if (insideRequireBlock) {
      const match = line.match(/^\s*([^\s]+)\s+([^\s]+)(?:\s*\/\/.*)?$/);
      if (match) {
        deps.push({
          path: match[1],
          version: match[2],
          indirect: line.includes('// indirect')
        });
      }
      continue;
    }
    
    // 单行 require
    const singleMatch = line.match(/^require\s+([^\s]+)\s+([^\s]+)(?:\s*\/\/.*)?$/);
    if (singleMatch) {
      deps.push({
        path: singleMatch[1],
        version: singleMatch[2],
        indirect: line.includes('// indirect')
      });
    }
  }
  
  return deps;
}
```

## 3. 标准库依赖解析

### 3.1 标准库依赖发现

```typescript
async parseStdlibDeps(projectRoot: string): Promise<DependencyInfo[]> {
  return new Promise((resolve, reject) => {
    // 首先获取GOROOT
    exec('go env GOROOT', { cwd: projectRoot }, (error, goroot, _stderr) => {
      if (error) {
        outputChannel.appendLine(`[WARN] Failed to get GOROOT: ${error.message}`);
        resolve([]);
        return;
      }
      
      const gorootSrc = path.join(goroot.trim(), 'src');
      
      // 执行 go list 获取项目导入的所有包
      exec('go list -json ./...', { 
        cwd: projectRoot, 
        maxBuffer: 10 * 1024 * 1024 
      }, (error, stdout, _stderr) => {
        if (error) {
          outputChannel.appendLine(`[WARN] Failed to get project imports: ${error.message}`);
          resolve([]);
          return;
        }
        
        try {
          const packages = parseJsonStream(stdout);
          const stdlibPackages = new Set<string>();
          
          // 收集所有标准库导入
          for (const pkg of packages) {
            const allImports = [
              ...(pkg.Imports || []),
              ...(pkg.TestImports || []),
              ...(pkg.XTestImports || []),
              ...(pkg.Deps || [])
            ];
            
            for (const imp of allImports) {
              if (isStandardLibraryPackage(imp)) {
                stdlibPackages.add(imp);
              }
            }
          }
          
          // 转换为DependencyInfo格式
          const stdlibDeps: DependencyInfo[] = Array.from(stdlibPackages).map(pkg => ({
            path: pkg,
            version: 'stdlib',
            indirect: false,
            dir: path.join(gorootSrc, pkg)
          }));
          
          outputChannel.appendLine(`[${projectRoot}] Found ${stdlibDeps.length} stdlib dependencies`);
          resolve(stdlibDeps);
        } catch (e) {
          outputChannel.appendLine(`[WARN] Failed to parse stdlib deps: ${e}`);
          resolve([]);
        }
      });
    });
  });
}
```

### 3.2 标准库包识别

```typescript
// 来自 pure.ts
export function isStandardLibraryPackage(packagePath: string): boolean {
  // 跳过本地包
  if (packagePath.startsWith('./') || packagePath.startsWith('../')) {
    return false;
  }
  
  // 已知标准库包前缀
  const stdlibPrefixes = [
    'archive/', 'bufio', 'builtin', 'bytes', 'compress/', 'container/',
    'context', 'crypto/', 'database/', 'debug/', 'embed', 'encoding/',
    'errors', 'expvar', 'fmt', 'go/', 'hash/', 'html/', 'image/',
    'index/', 'io/', 'io', 'log/', 'log', 'math/', 'math', 'mime/',
    'mime', 'net/', 'net', 'os/', 'os', 'path/', 'path', 'plugin',
    'reflect', 'regexp', 'runtime/', 'runtime', 'sort', 'strconv',
    'strings', 'sync/', 'sync', 'syscall', 'testing/', 'testing',
    'text/', 'time/', 'time', 'unicode/', 'unicode', 'unsafe'
  ];
  
  // 匹配标准库模式
  for (const prefix of stdlibPrefixes) {
    if (packagePath === prefix.replace('/', '') || packagePath.startsWith(prefix)) {
      return true;
    }
  }
  
  // 启发式：不包含点号的包可能是标准库
  return !packagePath.includes('.') && !packagePath.includes('/');
}
```

## 4. 源码路径计算

### 4.1 模块依赖路径计算

```typescript
getSourcePath(dep: DependencyInfo, projectRoot: string): string {
  const useReplace = this.config.handleReplace && dep.replace;
  const effectiveDep = useReplace ? dep.replace! : dep;

  // Vendor 目录优先
  if (this.config.vendorFirst) {
    const vendorPath = path.join(projectRoot, 'vendor', effectiveDep.path);
    if (fs.existsSync(vendorPath)) {
      return vendorPath;
    }
  }

  // v0.1.14 修复：当 handleReplace=false 但依赖有 replace 时
  // dep.dir 指向替换后的位置，需要使用 GOPATH 获取原始路径
  if (!useReplace && dep.replace && effectiveDep.dir) {
    const gopath = getGopath();
    const originalPath = path.join(gopath, 'pkg', 'mod', `${dep.path}@${dep.version}`);
    if (fs.existsSync(originalPath)) {
      return originalPath;
    }
    // 如果原始路径不存在，仍使用 dep.dir
  }

  // 使用 go list 返回的路径
  if (effectiveDep.dir) {
    return effectiveDep.dir;
  }

  // 降级：手动拼接 GOPATH
  const gopath = getGopath();
  return path.join(gopath, 'pkg', 'mod', `${effectiveDep.path}@${effectiveDep.version}`);
}
```

### 4.2 标准库路径计算

```typescript
getStdlibSourcePath(pkgPath: string): string {
  // 从已解析的标准库依赖中查找
  for (const [, deps] of this.stdlibDeps) {
    for (const dep of deps) {
      if (dep.path === pkgPath && dep.version === 'stdlib' && dep.dir) {
        return dep.dir;
      }
    }
  }
  
  // 降级：使用GOROOT拼接
  const goroot = process.env.GOROOT || '/usr/local/go';
  return path.join(goroot, 'src', pkgPath);
}
```

### 4.3 GOPATH 获取工具

```typescript
// 来自 utils.ts
export function getGopath(): string {
  return process.env.GOPATH || path.join(os.homedir(), 'go');
}
```

## 5. Replace 指令处理

### 5.1 Replace 类型

Go模块支持三种replace指令：
```go
// 1. 版本替换
replace github.com/old/module v1.0.0 => github.com/new/module v2.0.0

// 2. 本地路径替换  
replace github.com/old/module => ../local/path

// 3. 完全路径替换
replace github.com/old/module => github.com/new/module
```

### 5.2 Replace 数据结构

```typescript
interface ReplaceInfo {
  path: string;      // 替换后的模块路径
  version?: string;  // 替换后的版本（可选）
  dir?: string;      // 本地目录路径（go list 提供）
}

interface DependencyInfo {
  replace?: ReplaceInfo; // replace 信息（可选）
}
```

### 5.3 Replace 配置控制

```typescript
// ConfigManager 配置项
get handleReplace(): boolean {
  return vscode.workspace.getConfiguration('goDepsExplorer').get('handleReplace', true);
}
```

**配置行为**：
- `handleReplace: true`（默认）：显示替换后的路径和版本
- `handleReplace: false`：显示原始路径和版本，忽略replace指令

## 6. Vendor 支持

### 6.1 Vendor 优先配置

```typescript
get vendorFirst(): boolean {
  return vscode.workspace.getConfiguration('goDepsExplorer').get('vendorFirst', false);
}
```

### 6.2 Vendor 路径检测

```typescript
private hasValidVendor(projectRoot: string): boolean {
  const vendorDir = path.join(projectRoot, 'vendor');
  const modulesFile = path.join(vendorDir, 'modules.txt');
  
  return fs.existsSync(vendorDir) && 
         fs.existsSync(modulesFile) &&
         fs.statSync(vendorDir).isDirectory();
}
```

## 7. 错误处理与降级策略

### 7.1 命令失败处理

```typescript
// go list 失败 → go.mod 直接解析
// go env GOROOT 失败 → 环境变量 GOROOT → 常见路径猜测
// 目录不存在 → 显示 "(source not available)"
```

### 7.2 日志输出

```typescript
const outputChannel = vscode.window.createOutputChannel('Go Deps Explorer');

// 成功日志
outputChannel.appendLine(`[${projectRoot}] Loaded ${deps.length} dependencies`);

// 警告日志  
outputChannel.appendLine(`[WARN] go list failed: ${error.message}, using go.mod fallback`);

// 错误日志
outputChannel.appendLine(`[ERROR] Failed to parse dependencies: ${error}`);
```

## 8. 性能优化

### 8.1 缓存策略
- 项目依赖缓存：解析结果缓存在内存中，只在go.mod变更时重新解析
- GOROOT缓存：`go env GOROOT`结果缓存，避免重复执行

### 8.2 并发控制
```typescript
// 使用 maxBuffer 防止大型项目输出截断
exec('go list -m -json all', { 
  cwd, 
  maxBuffer: 10 * 1024 * 1024  // 10MB buffer
}, callback);
```

### 8.3 超时处理
依赖Node.js child_process的默认超时机制，避免长时间阻塞。

## 9. 扩展性设计

### 9.1 解析器插拔
通过依赖注入ConfigManager，支持不同配置下的行为变化。

### 9.2 新Go版本兼容
使用go list标准输出格式，兼容Go 1.11+的模块系统。

### 9.3 多语言扩展
核心解析逻辑抽象在pure.ts中，可复用于其他语言的依赖解析。