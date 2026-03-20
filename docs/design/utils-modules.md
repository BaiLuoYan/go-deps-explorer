# 辅助模块设计

## 修订记录
| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0  | 2026-03-20 | DEV | 基于v0.2.5源码重构辅助模块文档 |

## 1. 模块概述

辅助模块包含扩展的配套功能组件，虽然不在核心数据流路径上，但为用户体验和系统稳定性提供重要支撑。

### 1.1 辅助模块列表
- **ReadonlyFileViewer**：只读文件查看器
- **GoModWatcher**：go.mod文件变更监听器
- **Pure Functions**：纯函数工具库
- **Utils**：通用工具函数

## 2. ReadonlyFileViewer（只读文件查看器）

### 2.1 模块职责
负责以只读方式打开依赖包源码文件，确保用户不会意外修改第三方依赖代码。

### 2.2 架构演进历史

#### v0.1.19及之前：自定义URI scheme
```typescript
// 旧架构：使用自定义 go-dep: scheme
class DepFileContentProvider implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(uri: vscode.Uri): string {
    const fsPath = decodeURIComponent(uri.query);
    return fs.readFileSync(fsPath, 'utf8');
  }
}

// 打开文件
const uri = vscode.Uri.parse(`go-dep:${path.basename(fsPath)}?${fsPath}`);
const doc = await vscode.workspace.openTextDocument(uri);
```

**问题**：
- gopls无法索引自定义scheme文件
- 无法使用Cmd+Click跳转功能
- 缺失代码高亮和智能提示

#### v0.1.20：原生file:// URI
```typescript
// 新架构：使用原生 file:// URI
class ReadonlyFileViewer {
  async openFile(fsPath: string): Promise<void> {
    const uri = vscode.Uri.file(fsPath);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { 
      preview: true, 
      preserveFocus: false 
    });
    
    // v0.2.4+: 标记为只读
    await vscode.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession');
  }
}
```

**优势**：
- 完整的gopls语言服务支持
- 支持Cmd+Click跳转到其他依赖
- 保持只读特性

### 2.3 当前实现（v0.2.5）

```typescript
export class ReadonlyFileViewer {
  constructor() {}

  register(_context: vscode.ExtensionContext): void {
    // 无需注册自定义 ContentProvider
  }

  async openFile(fsPath: string): Promise<void> {
    const uri = vscode.Uri.file(fsPath);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { 
      preview: true,           // 预览模式，避免占用过多tab
      preserveFocus: false     // 切换焦点到打开的文件
    });
    
    // 标记为会话级只读（VS Code 1.79+）
    try {
      await vscode.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession');
    } catch {
      // 兼容旧版本：静默忽略
    }
  }

  dispose(): void {}
}
```

### 2.4 只读策略
- **会话级只读**：使用`workbench.action.files.setActiveEditorReadonlyInSession`
- **非破坏性**：不修改文件权限，仅在VSCode会话中标记只读
- **可恢复**：用户可通过命令面板手动移除只读状态

## 3. GoModWatcher（文件监听器）

### 3.1 模块职责
监听工作区中go.mod文件的变更，当依赖发生变化时自动刷新依赖树。

### 3.2 实现设计

```typescript
export class GoModWatcher {
  private watcher: vscode.FileSystemWatcher;
  private debounceTimer?: NodeJS.Timeout;
  
  constructor(private treeProvider: DependencyTreeProvider) {
    // 创建全局go.mod文件监听器
    this.watcher = vscode.workspace.createFileSystemWatcher('**/go.mod');
    
    // 监听文件变更事件
    this.watcher.onDidChange(() => this.debouncedRefresh());
    this.watcher.onDidCreate(() => this.debouncedRefresh());
    this.watcher.onDidDelete(() => this.debouncedRefresh());
  }
  
  // 防抖刷新，避免频繁触发
  private debouncedRefresh(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(() => {
      this.treeProvider.refresh();
    }, 1000);  // 1秒防抖延迟
  }
  
  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.watcher.dispose();
  }
}
```

### 3.3 监听模式

#### 文件系统监听
- **模式**：`**/go.mod`（全局递归匹配）
- **事件**：onChange、onCreate、onDelete
- **范围**：整个工作区目录树

#### 防抖机制
```
文件变更 → 清除旧定时器 → 设置1秒延时 → 执行刷新
连续变更 → 持续重置定时器 → 仅在静默1秒后触发
```

**防抖意义**：
- 避免保存时的频繁刷新
- 支持批量修改场景
- 减少不必要的go list执行

### 3.4 刷新策略

```typescript
private debouncedRefresh(): void {
  // 触发完整的依赖树刷新
  this.treeProvider.refresh();
}
```

`treeProvider.refresh()`会：
1. 清除节点缓存
2. 重新执行`go list`解析
3. 重建依赖树数据结构
4. 触发UI更新事件

## 4. Pure Functions（纯函数库）

### 4.1 模块职责
提供无副作用的纯函数工具，支持数据解析和路径处理。所有函数都是确定性的，相同输入保证相同输出。

### 4.2 JSON流解析

```typescript
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

**用途**：解析`go list -json`的输出，该命令输出多个JSON对象的连接而非JSON数组。

**算法复杂度**：O(n)时间，O(m)空间（m为JSON对象数量）

### 4.3 模块路径提取

```typescript
export function extractModuleFromPath(filePath: string, gopath: string): { modulePath: string; version: string } | null {
  const modCache = path.join(gopath, 'pkg', 'mod') + path.sep;
  
  if (!filePath.startsWith(modCache)) {
    return null;
  }

  const relative = filePath.slice(modCache.length);
  const atIdx = relative.indexOf('@');
  
  if (atIdx <= 0) {
    return null;
  }

  const modulePath = relative.slice(0, atIdx);
  const afterAt = relative.slice(atIdx + 1);
  const sepIdx = afterAt.indexOf(path.sep);
  const version = sepIdx > 0 ? afterAt.slice(0, sepIdx) : afterAt;

  return { modulePath, version };
}
```

**输入示例**：`/Users/user/go/pkg/mod/github.com/gin-gonic/gin@v1.9.1/context.go`
**输出结果**：`{ modulePath: "github.com/gin-gonic/gin", version: "v1.9.1" }`

### 4.4 标准库包识别

```typescript
export function isStandardLibraryPackage(packagePath: string): boolean {
  // 跳过相对路径
  if (packagePath.startsWith('./') || packagePath.startsWith('../')) {
    return false;
  }
  
  // 标准库包前缀列表
  const stdlibPrefixes = [
    'archive/', 'bufio', 'builtin', 'bytes', 'compress/', 'container/',
    'context', 'crypto/', 'database/', 'debug/', 'embed', 'encoding/',
    'errors', 'expvar', 'fmt', 'go/', 'hash/', 'html/', 'image/',
    // ... 更多标准库包
  ];
  
  // 精确匹配
  for (const prefix of stdlibPrefixes) {
    if (packagePath === prefix.replace('/', '') || packagePath.startsWith(prefix)) {
      return true;
    }
  }
  
  // 启发式规则：不含域名的包可能是标准库
  return !packagePath.includes('.') && !packagePath.includes('/');
}
```

### 4.5 go.mod文本解析

```typescript
export function parseGoModText(content: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  const lines = content.split('\n');
  let insideRequireBlock = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // require 块状态管理
    if (trimmed.startsWith('require (')) {
      insideRequireBlock = true;
      continue;
    }
    
    if (insideRequireBlock && trimmed === ')') {
      insideRequireBlock = false;
      continue;
    }
    
    // 依赖行解析
    if (insideRequireBlock) {
      const match = trimmed.match(/^\s*([^\s]+)\s+([^\s]+)(?:\s*\/\/.*)?$/);
      if (match) {
        deps.push({
          path: match[1],
          version: match[2],
          indirect: trimmed.includes('// indirect')
        });
      }
    } else {
      // 单行require处理
      const singleMatch = trimmed.match(/^require\s+([^\s]+)\s+([^\s]+)(?:\s*\/\/.*)?$/);
      if (singleMatch) {
        deps.push({
          path: singleMatch[1],
          version: singleMatch[2],
          indirect: trimmed.includes('// indirect')
        });
      }
    }
  }
  
  return deps;
}
```

**支持格式**：
```go
// 块状require
require (
    github.com/gin-gonic/gin v1.9.1
    gopkg.in/yaml.v3 v3.0.1 // indirect
)

// 单行require
require github.com/gorilla/mux v1.8.0
```

## 5. Utils（通用工具函数）

### 5.1 GOPATH获取

```typescript
export function getGopath(): string {
  return process.env.GOPATH || path.join(os.homedir(), 'go');
}
```

**降级策略**：
1. 优先使用环境变量`GOPATH`
2. 降级到`$HOME/go`默认路径

### 5.2 路径规范化

```typescript
export function normalizePath(filePath: string): string {
  return path.normalize(filePath).replace(/\\/g, '/');
}
```

确保跨平台路径一致性。

## 6. 错误处理策略

### 6.1 优雅降级

```typescript
// ReadonlyFileViewer 中的容错
try {
  await vscode.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession');
} catch {
  // 静默忽略，兼容旧版本VSCode
}
```

### 6.2 日志记录

```typescript
// GoModWatcher 中的日志
const outputChannel = vscode.window.createOutputChannel('Go Deps Explorer');
outputChannel.appendLine(`go.mod changed, refreshing dependency tree`);
```

### 6.3 资源清理

```typescript
dispose(): void {
  if (this.debounceTimer) {
    clearTimeout(this.debounceTimer);
  }
  this.watcher.dispose();
}
```

确保定时器和文件监听器正确清理。

## 7. 性能优化

### 7.1 防抖算法
GoModWatcher使用1秒防抖，平衡响应性和性能。

### 7.2 懒加载
ReadonlyFileViewer不预加载文件内容，按需打开。

### 7.3 缓存策略
Pure functions无状态，天然支持结果缓存。

## 8. 测试策略

### 8.1 纯函数测试

```typescript
describe('parseJsonStream', () => {
  it('should parse multiple JSON objects', () => {
    const input = '{"a":1}{"b":2}';
    const result = parseJsonStream(input);
    expect(result).toEqual([{a:1}, {b:2}]);
  });
});
```

### 8.2 监听器测试

```typescript
describe('GoModWatcher', () => {
  it('should debounce file changes', async () => {
    const mockTreeProvider = { refresh: jest.fn() };
    const watcher = new GoModWatcher(mockTreeProvider);
    
    // 模拟连续文件变更
    // 验证防抖效果
  });
});
```

## 9. 扩展性设计

### 9.1 新辅助模块添加

遵循单一职责原则，每个辅助模块专注特定功能。

### 9.2 纯函数扩展

在pure.ts中添加新的无副作用工具函数。

### 9.3 监听器扩展

可参考GoModWatcher模式，添加其他文件类型的监听器。