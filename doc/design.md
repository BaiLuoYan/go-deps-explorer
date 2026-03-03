# Go Dependencies Explorer — 软件设计文档

**文档版本**: v1.0  
**日期**: 2026-03-03  
**状态**: 待项目经理审核

---

## 1. 架构概览

```
┌─────────────────────────────────────────────────┐
│                  VSCode Extension                │
│                                                  │
│  ┌──────────┐   ┌──────────────────────────┐    │
│  │ Extension │──▶│  DependencyTreeProvider   │    │
│  │  Entry    │   │  (TreeDataProvider impl)  │    │
│  └──────────┘   └──────────┬───────────────┘    │
│       │                    │                     │
│       ▼                    ▼                     │
│  ┌──────────┐   ┌──────────────────────────┐    │
│  │GoMod     │   │  TreeNode 数据模型         │    │
│  │Watcher   │   │  - ProjectNode            │    │
│  └──────────┘   │  - CategoryNode           │    │
│       │         │  - DependencyNode          │    │
│       ▼         │  - DirectoryNode           │    │
│  ┌──────────┐   │  - FileNode               │    │
│  │GoMod     │   └──────────────────────────┘    │
│  │Parser    │                                    │
│  └──────────┘   ┌──────────────────────────┐    │
│                 │  EditorTracker            │    │
│  ┌──────────┐   │  (跳转定位)               │    │
│  │Config    │   └──────────────────────────┘    │
│  │Manager   │                                    │
│  └──────────┘   ┌──────────────────────────┐    │
│                 │  ReadonlyFileViewer       │    │
│                 │  (只读打开文件)            │    │
│                 └──────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

## 2. 模块设计

### 2.1 Extension Entry (`extension.ts`)

**职责**: 扩展激活/停用入口

**激活条件**: `workspaceContains:**/go.mod`

**activate() 流程**:
1. 初始化 ConfigManager
2. 扫描工作区所有 go.mod（支持单项目和多项目工作空间）
3. 创建 DependencyTreeProvider 并注册到 TreeView
4. 创建 GoModWatcher 监听 go.mod 变化
5. 创建 EditorTracker 监听编辑器切换
6. 注册命令：手动刷新、打开文件

**deactivate() 流程**:
1. 销毁 watcher、tracker
2. 释放资源

### 2.2 GoModParser (`goModParser.ts`)

**职责**: 解析 Go 项目依赖信息

**核心方法**:
```typescript
interface DependencyInfo {
  path: string;          // 模块路径，如 "github.com/gin-gonic/gin"
  version: string;       // 版本号，如 "v1.9.1"
  indirect: boolean;     // 是否间接依赖
  dir?: string;          // 本地源码路径（go list 返回）
  goVersion?: string;    // Go 版本要求
  replace?: {            // replace 信息
    path: string;
    version?: string;
    dir?: string;
  };
}

class GoModParser {
  private outputChannel: vscode.OutputChannel;  // 提供诊断日志

  // 解析单个项目的所有依赖
  async parseDependencies(projectRoot: string): Promise<DependencyInfo[]>;
  
  // 内部：执行 go list -m -json all
  private async runGoList(cwd: string): Promise<DependencyInfo[]>;
  
  // fallback 解析器：支持多 require 块和单行 require
  private async parseGoModFallback(projectRoot: string): Promise<DependencyInfo[]>;
  
  // 内部：判断 vendor 是否存在且有效
  private async hasVendor(projectRoot: string): Promise<boolean>;
  
  // 获取依赖包的源码路径
  getSourcePath(dep: DependencyInfo, projectRoot: string, useVendor: boolean): string;
}
```

**go list 命令**:
```bash
go list -m -json all
```
返回 JSON 流（每个模块一个 JSON 对象），包含：
- `Path`: 模块路径
- `Version`: 版本
- `Indirect`: 是否间接
- `Dir`: 本地缓存路径
- `Replace`: replace 信息（如有）
- `GoVersion`: 要求的 Go 版本

**路径判断逻辑**:
```
if (config.vendorFirst && vendor/ 存在 && vendor/modules.txt 存在):
    sourcePath = projectRoot/vendor/{modulePath}
else:
    sourcePath = dep.Dir  // go list 返回的路径（通常是 $GOPATH/pkg/mod/...）
```

**replace 处理**:
```
if (config.handleReplace && dep.replace 存在):
    使用 replace.dir 或 replace.path@replace.version 的路径
else:
    使用原始 dep 路径
```

### 2.3 DependencyTreeProvider (`dependencyTreeProvider.ts`)

**职责**: 实现 `vscode.TreeDataProvider<TreeNode>`，驱动侧边栏依赖树

**核心接口**:
```typescript
class DependencyTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  // 统一的节点管理器 - 确保每个节点只有一个实例
  private nodeMap = new Map<string, TreeNode>();
  
  // 返回树节点的子节点
  getChildren(element?: TreeNode): Promise<TreeNode[]>;
  
  // 返回节点的 TreeItem 表示
  getTreeItem(element: TreeNode): vscode.TreeItem;
  
  // 返回节点的父节点（用于 reveal 定位）
  getParent(element: TreeNode): TreeNode | undefined;
  
  // 刷新整棵树
  refresh(): void;
  
  // 定位到指定文件路径（供 EditorTracker 调用）
  findNodeForFile(filePath: string): { depNode?: DependencyNode; fileNode?: FileNode };
  
  // 构建完整节点链（含目录和文件）
  private buildNodeChain(root: string, dep: DependencyInfo, sourcePath: string, filePath?: string): { depNode: DependencyNode; fileNode?: FileNode };
  
  // 获取或创建节点，确保单例
  private getOrCreateNode<T extends TreeNode>(factory: () => T): T;
}
```

**getChildren 逻辑**:
```
if (element === undefined):  // 根节点
    if (工作空间模式 && 多个项目):
        return ProjectNode[]
    else:
        return [CategoryNode("直接依赖"), CategoryNode("间接依赖")]

if (element is ProjectNode):
    return [CategoryNode("直接依赖"), CategoryNode("间接依赖")]

if (element is CategoryNode):
    return DependencyNode[]  // 过滤 direct/indirect

if (element is DependencyNode):
    return readDirectory(dep.sourcePath)  // 懒加载目录

if (element is DirectoryNode):
    return readDirectory(dir.path)  // 继续展开子目录

if (element is FileNode):
    return []  // 叶子节点
```

### 2.4 TreeNode 数据模型 (`models.ts`)

```typescript
// 节点类型枚举
enum NodeType {
  Project = 'project',
  Category = 'category',      // "直接依赖" / "间接依赖"
  Dependency = 'dependency',
  Directory = 'directory',
  File = 'file',
}

// 基础节点
interface BaseNode {
  type: NodeType;
  label: string;
  parent?: TreeNode;
  id: string;                // 每个 TreeNode class 都有唯一 id 字段
}

// 项目节点（工作空间模式）
interface ProjectNode extends BaseNode {
  type: NodeType.Project;
  projectRoot: string;
  dependencies: DependencyInfo[];
}

// 分类节点
interface CategoryNode extends BaseNode {
  type: NodeType.Category;
  category: 'direct' | 'indirect';
  projectRoot: string;
  dependencies: DependencyInfo[];
}

// 依赖包节点
interface DependencyNode extends BaseNode {
  type: NodeType.Dependency;
  dep: DependencyInfo;
  sourcePath: string;       // 实际源码路径
}

// 目录节点
interface DirectoryNode extends BaseNode {
  type: NodeType.Directory;
  fsPath: string;
  dep: DependencyInfo;      // 所属依赖（用于定位）
}

// 文件节点
interface FileNode extends BaseNode {
  type: NodeType.File;
  fsPath: string;
  dep: DependencyInfo;      // 所属依赖（用于定位）
}

type TreeNode = ProjectNode | CategoryNode | DependencyNode | DirectoryNode | FileNode;
```

### 2.5 ReadonlyFileViewer (`readonlyFileViewer.ts`)

**职责**: 以只读方式打开依赖包文件

**实现方案**: 使用 `vscode.Uri` 的自定义 scheme

```typescript
class ReadonlyFileViewer {
  // 注册自定义 TextDocumentContentProvider
  register(context: vscode.ExtensionContext): void;
  
  // 打开文件（只读）
  async openFile(fsPath: string): Promise<void>;
}
```

**只读实现**:
```typescript
// 方案：使用自定义 URI scheme + TextDocumentContentProvider
const SCHEME = 'go-dep';

class DepFileContentProvider implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(uri: vscode.Uri): string {
    const fsPath = decodeURIComponent(uri.query);  // 使用 decodeURIComponent 解码路径
    return fs.readFileSync(fsPath, 'utf8');
  }
}

// 打开文件时
async openFile(fsPath: string) {
  const uri = vscode.Uri.parse(`${SCHEME}:${path.basename(fsPath)}?${fsPath}`);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: true });
}
```

### 2.6 EditorTracker (`editorTracker.ts`)

**职责**: 监听编辑器切换，当用户跳转到依赖包代码时自动定位依赖树

**实现**:
```typescript
class EditorTracker {
  private outputChannel: vscode.OutputChannel;
  private lastProjectRoot: string | undefined;  // 追踪用户最后访问的项目根目录

  constructor(
    private treeView: vscode.TreeView<TreeNode>,
    private treeProvider: DependencyTreeProvider
  ) {
    this.outputChannel = vscode.window.createOutputChannel('Go Dependencies Explorer');
    // 监听 active editor 变化
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) this.onEditorChanged(editor);
    });
  }
  
  private async onEditorChanged(editor: vscode.TextEditor): Promise<void> {
    const filePath = editor.document.uri.fsPath;
    
    // 跟踪 lastProjectRoot：从非依赖文件中记住用户的项目根目录
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (workspaceFolder) {
      this.lastProjectRoot = workspaceFolder.uri.fsPath;
    }

    // 判断文件是否在某个依赖包路径下
    if (this.isDependencyFile(filePath)) {
      // reveal fileNode 而非 depNode，实现精确展开
      const result = this.treeProvider.findNodeForFile(filePath, this.lastProjectRoot);
      if (result?.fileNode) {
        await this.treeView.reveal(result.fileNode, { select: true, focus: false, expand: false });
      }
    }
  }
  
  private isDependencyFile(filePath: string): boolean {
    const gopath = process.env.GOPATH || path.join(os.homedir(), 'go');
    const modCachePath = path.join(gopath, 'pkg', 'mod');
    return filePath.startsWith(modCachePath) || filePath.includes('/vendor/');
  }
}
```

**revealFile 流程**:
1. 遍历已加载的依赖列表，找到 filePath 所属的依赖包
2. 构建从根节点到目标文件的完整路径链
3. 调用 `treeView.reveal(fileNode, { select: true, focus: false, expand: true })`

### 2.7 GoModWatcher (`goModWatcher.ts`)

**职责**: 监听 go.mod 文件变化，触发依赖树刷新

```typescript
class GoModWatcher {
  private watcher: vscode.FileSystemWatcher;
  private debounceTimer?: NodeJS.Timeout;
  
  constructor(private treeProvider: DependencyTreeProvider) {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/go.mod');
    this.watcher.onDidChange(() => this.debouncedRefresh());
    this.watcher.onDidCreate(() => this.debouncedRefresh());
    this.watcher.onDidDelete(() => this.debouncedRefresh());
  }
  
  // 防抖刷新（避免频繁触发）
  private debouncedRefresh(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.treeProvider.refresh();
    }, 1000);  // 1秒防抖
  }
  
  dispose(): void {
    this.watcher.dispose();
  }
}
```

### 2.8 ConfigManager (`configManager.ts`)

**职责**: 读取和管理插件配置

```typescript
class ConfigManager {
  get handleReplace(): boolean {
    return vscode.workspace.getConfiguration('goDepsExplorer').get('handleReplace', true);
  }
  
  get showIndirect(): boolean {
    return vscode.workspace.getConfiguration('goDepsExplorer').get('showIndirect', true);
  }
  
  get vendorFirst(): boolean {
    return vscode.workspace.getConfiguration('goDepsExplorer').get('vendorFirst', false);
  }
  
  // 监听配置变化
  onConfigChange(callback: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('goDepsExplorer')) {
        callback();
      }
    });
  }
}
```

## 3. 核心流程

### 3.1 扩展激活流程

```
1. VSCode 检测到工作区包含 go.mod → 激活扩展
2. activate():
   a. 创建 ConfigManager
   b. 创建 GoModParser
   c. 扫描工作区所有 go.mod 路径
      - 单项目: vscode.workspace.workspaceFolders[0]
      - 工作空间: 遍历所有 workspaceFolders，检查各自的 go.mod
   d. 对每个项目执行 goModParser.parseDependencies(root)
   e. 创建 DependencyTreeProvider，传入依赖数据
   f. 注册 TreeView: vscode.window.createTreeView('goDepsExplorer', { treeDataProvider, showCollapseAll: true })
   g. 创建 GoModWatcher → 关联 treeProvider.refresh()
   h. 创建 EditorTracker → 关联 treeView
   i. 注册命令:
      - goDepsExplorer.refresh → treeProvider.refresh()
      - goDepsExplorer.openFile → readonlyFileViewer.openFile(path)
```

### 3.2 用户点击依赖展开流程

```
1. 用户点击 DependencyNode（collapsibleState = Collapsed）
2. VSCode 调用 getChildren(DependencyNode)
3. 读取 dep.sourcePath 目录内容（fs.readdir）
4. 生成 DirectoryNode[] 和 FileNode[]，排序：目录在前，文件在后，字母排序
5. 返回子节点列表
6. 用户点击 FileNode
7. 触发 command: goDepsExplorer.openFile
8. ReadonlyFileViewer.openFile(node.fsPath) → 只读打开
```

### 3.3 Cmd+Click 跳转定位流程

```
1. 用户 Cmd+Click 跳转到依赖包中的某个文件
2. onDidChangeActiveTextEditor 触发
3. EditorTracker 获取新文件路径
4. 判断路径是否在 $GOPATH/pkg/mod/ 或 vendor/ 下
5. 如果是:
   a. 从路径中解析出 modulePath@version
   b. 在依赖树中查找对应的 DependencyNode
   c. 构建到目标文件的完整节点路径
   d. 调用 treeView.reveal(fileNode, { select: true, expand: true })
```

### 3.4 go.mod 变更刷新流程

```
1. FileSystemWatcher 检测到 go.mod 变化
2. 防抖 1 秒后触发
3. 重新执行 goModParser.parseDependencies() 获取最新依赖
4. 更新 DependencyTreeProvider 内部数据
5. 触发 _onDidChangeTreeData.fire(undefined) → 整树刷新
```

## 4. code/ 目录结构

```
code/
├── .vscode/
│   └── launch.json              # 调试配置
├── src/
│   ├── extension.ts             # 扩展入口
│   ├── models.ts                # 数据模型定义
│   ├── goModParser.ts           # go.mod 解析器
│   ├── dependencyTreeProvider.ts # 树数据提供者
│   ├── readonlyFileViewer.ts    # 只读文件查看器
│   ├── editorTracker.ts         # 编辑器跳转追踪
│   ├── goModWatcher.ts          # go.mod 文件监听
│   ├── configManager.ts         # 配置管理
│   └── utils.ts                 # 工具函数
├── resources/
│   ├── icons/
│   │   ├── dependency.svg       # 依赖包图标
│   │   ├── dependency-indirect.svg  # 间接依赖图标
│   │   ├── folder.svg           # 目录图标
│   │   └── go-file.svg          # Go 文件图标
│   └── logo.png                 # 扩展 logo
├── package.json                 # VSCode 扩展清单
├── tsconfig.json                # TypeScript 配置
├── .eslintrc.json               # ESLint 配置
├── .vscodeignore                # 发布排除文件
├── CHANGELOG.md                 # 更新日志
├── README.md                    # 扩展说明
└── LICENSE                      # 开源协议
```

## 5. package.json 关键配置

```jsonc
{
  "name": "go-deps-explorer",
  "displayName": "Go Dependencies Explorer",
  "description": "Browse and explore Go project dependencies in VS Code",
  "version": "0.1.0",
  "publisher": "TBD",
  "engines": { "vscode": "^1.75.0" },
  "categories": ["Other"],
  "activationEvents": ["workspaceContains:**/go.mod"],
  "main": "./out/extension.js",
  "contributes": {
    "views": {
      "explorer": [{
        "id": "goDepsExplorer",
        "name": "Go Dependencies",
        "when": "goDepsExplorer.hasGoMod"
      }]
    },
    "commands": [
      { "command": "goDepsExplorer.refresh", "title": "Refresh Dependencies", "icon": "$(refresh)" },
      { "command": "goDepsExplorer.openFile", "title": "Open Dependency File (Read-only)" }
    ],
    "menus": {
      "view/title": [{
        "command": "goDepsExplorer.refresh",
        "when": "view == goDepsExplorer",
        "group": "navigation"
      }]
    },
    "configuration": {
      "title": "Go Dependencies Explorer",
      "properties": {
        "goDepsExplorer.handleReplace": {
          "type": "boolean",
          "default": true,
          "description": "是否处理 go.mod 中的 replace 指令"
        },
        "goDepsExplorer.showIndirect": {
          "type": "boolean",
          "default": true,
          "description": "是否显示间接依赖"
        },
        "goDepsExplorer.vendorFirst": {
          "type": "boolean",
          "default": false,
          "description": "优先使用 vendor 目录"
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "lint": "eslint src --ext ts",
    "package": "vsce package",
    "publish": "vsce publish"
  },
  "devDependencies": {
    "@types/node": "^18.0.0",
    "@types/vscode": "^1.75.0",
    "@vscode/vsce": "^2.22.0",
    "typescript": "^5.3.0",
    "eslint": "^8.56.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0"
  }
}
```

## 6. 第三方依赖

| 包名 | 用途 | 说明 |
|------|------|------|
| `@types/vscode` | VSCode API 类型定义 | devDependency |
| `@types/node` | Node.js 类型定义 | devDependency |
| `typescript` | TypeScript 编译器 | devDependency |
| `@vscode/vsce` | 扩展打包发布工具 | devDependency |
| `eslint` + TS 插件 | 代码规范检查 | devDependency |

**无运行时依赖**：全部使用 VSCode 内置 API 和 Node.js 标准库。

## 7. 关键实现细节

### 7.1 获取直接/间接依赖

```typescript
// 执行 go list -m -json all，解析 JSON 流
async function runGoList(cwd: string): Promise<DependencyInfo[]> {
  const { stdout } = await execAsync('go list -m -json all', { cwd });
  
  // go list 输出是多个 JSON 对象拼接（非 JSON 数组），需要逐个解析
  const deps: DependencyInfo[] = [];
  const decoder = new JsonStreamDecoder(stdout);
  for (const mod of decoder) {
    if (mod.Main) continue;  // 跳过主模块自身
    deps.push({
      path: mod.Path,
      version: mod.Version || '',
      indirect: mod.Indirect === true,
      dir: mod.Dir,
      goVersion: mod.GoVersion,
      replace: mod.Replace ? {
        path: mod.Replace.Path,
        version: mod.Replace.Version,
        dir: mod.Replace.Dir,
      } : undefined,
    });
  }
  return deps;
}
```

**JSON 流解析**: go list 输出多个 JSON 对象（用 `}{` 分隔），需要逐个提取。使用简单的括号匹配即可：
```typescript
function parseJsonStream(text: string): any[] {
  const results: any[] = [];
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) start = i; depth++; }
    if (text[i] === '}') { depth--; if (depth === 0 && start >= 0) { results.push(JSON.parse(text.slice(start, i + 1))); start = -1; } }
  }
  return results;
}
```

### 7.2 vendor vs $GOPATH/pkg/mod 判断

```typescript
function getSourcePath(dep: DependencyInfo, projectRoot: string, config: ConfigManager): string {
  // replace 处理
  const effectiveDep = (config.handleReplace && dep.replace) ? dep.replace : dep;
  
  // vendor 优先检查
  if (config.vendorFirst) {
    const vendorPath = path.join(projectRoot, 'vendor', effectiveDep.path);
    if (fs.existsSync(vendorPath)) return vendorPath;
  }
  
  // 使用 go list 返回的 Dir（已解析好的本地路径）
  if (effectiveDep.dir) return effectiveDep.dir;
  
  // fallback: 手动拼接 GOPATH
  const gopath = process.env.GOPATH || path.join(os.homedir(), 'go');
  return path.join(gopath, 'pkg', 'mod', `${effectiveDep.path}@${effectiveDep.version}`);
}
```

### 7.3 DependencyNode 的 TreeItem 表示

```typescript
// 依赖包根节点
getTreeItem(node: DependencyNode): vscode.TreeItem {
  const hasSource = fs.existsSync(node.sourcePath);
  const item = new vscode.TreeItem(
    `${node.dep.path}@${node.dep.version}`,
    hasSource ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
  );
  
  // 图标区分直接/间接
  item.iconPath = node.dep.indirect
    ? new vscode.ThemeIcon('package', new vscode.ThemeColor('disabledForeground'))
    : new vscode.ThemeIcon('package');
  
  // 源码不存在时显示说明
  if (!hasSource) {
    item.description = '(source not available)';
  }
  
  // Tooltip 详细信息（英文标签 + 正确换行）
  const lines = [
    `**${node.dep.path}**`,
    ``,
    `Version: \`${node.dep.version}\`  `,
    `Type: ${node.dep.indirect ? 'Indirect' : 'Direct'}  `,
    `Path: \`${node.sourcePath}\`  `,
  ];
  if (node.dep.replace) {
    lines.push(``);
    lines.push(`**Replace:**  `);
    lines.push(`→ ${node.dep.replace.path}${node.dep.replace.version ? '@' + node.dep.replace.version : ''}  `);
    if (node.dep.replace.dir) { lines.push(`Path: \`${node.dep.replace.dir}\`  `); }
  }
  if (node.dep.goVersion) lines.push(`Go Version: \`${node.dep.goVersion}\`  `);
  item.tooltip = new vscode.MarkdownString(lines.join('\n'));
  
  // contextValue 用于菜单控制
  item.contextValue = node.dep.indirect ? 'dependency-indirect' : 'dependency-direct';
  
  return item;
}
```

### 7.4 跳转定位的路径匹配

```typescript
// 从文件绝对路径中提取 module@version
function extractModuleFromPath(filePath: string): { modulePath: string; version: string } | null {
  const gopath = process.env.GOPATH || path.join(os.homedir(), 'go');
  const modCache = path.join(gopath, 'pkg', 'mod');
  
  if (filePath.startsWith(modCache)) {
    // 路径格式: $GOPATH/pkg/mod/github.com/user/repo@v1.0.0/...
    const relative = filePath.slice(modCache.length + 1);
    // 找到 @version 部分
    const atIdx = relative.indexOf('@');
    if (atIdx > 0) {
      const modulePath = relative.slice(0, atIdx);
      const afterAt = relative.slice(atIdx + 1);
      const slashIdx = afterAt.indexOf(path.sep);
      const version = slashIdx > 0 ? afterAt.slice(0, slashIdx) : afterAt;
      return { modulePath, version };
    }
  }
  
  // vendor 模式: projectRoot/vendor/github.com/user/repo/...
  // 需遍历已知依赖列表匹配
  return null;
}
```

### 7.5 懒加载策略

- DependencyNode 初始 `collapsibleState = Collapsed`，不预加载子目录
- 用户展开时 `getChildren()` 才读取 `fs.readdir()`
- DirectoryNode 同理，逐层懒加载
- 文件/目录排序：目录在前、文件在后、各自按字母排序
- 隐藏不必要的文件：`.git/` 等（可配置）
