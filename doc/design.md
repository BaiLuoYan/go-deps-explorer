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
3. 使用 findGoProjects() 获取项目信息，返回 `{ root, name }[]`，其中 name 来自 VSCode workspace folder API
4. 创建 DependencyTreeProvider 并注册到 TreeView
5. 创建 GoModWatcher 监听 go.mod 变化
6. 创建 EditorTracker 监听编辑器切换
7. 注册命令：手动刷新、打开文件

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
  
  // 解析标准库依赖（新增）
  // v0.1.12 变更：收集 Imports + TestImports + XTestImports + Deps 四个字段
  async parseStdlibDeps(projectRoot: string): Promise<DependencyInfo[]>;
  
  // 内部：执行 go list -m -json all
  private async runGoList(cwd: string): Promise<DependencyInfo[]>;
  
  // 内部：执行 go list -json ./... 获取项目 import 列表
  // v0.1.12 变更：收集 pkg.Imports、TestImports、XTestImports、Deps 四个字段的所有标准库包
  private async runGoListImports(cwd: string): Promise<string[]>;
  
  // 判断包路径是否为标准库包
  private isStandardLibraryPackage(pkgPath: string): boolean;
  
  // fallback 解析器：支持多 require 块和单行 require
  private async parseGoModFallback(projectRoot: string): Promise<DependencyInfo[]>;
  
  // 内部：判断 vendor 是否存在且有效
  private async hasVendor(projectRoot: string): Promise<boolean>;
  
  // 获取依赖包的源码路径
  // v0.1.14 修复：go list 的 Dir 字段在有 replace 时指向替换后路径
  // 当 handleReplace=false 且存在 replace 时，跳过被污染的 dep.dir，使用 GOPATH 拼接原始路径
  getSourcePath(dep: DependencyInfo, projectRoot: string, useVendor: boolean): string;
  
  // 获取标准库包的源码路径（新增）
  getStdlibSourcePath(pkgPath: string): string;
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
    // v0.1.14 修复：当 handleReplace=false 且存在 replace 时，
    // dep.dir 已被 go list 污染指向替换后路径，需跳过使用 GOPATH 拼接原始路径
    if (config.handleReplace == false && dep.replace 存在):
        sourcePath = GOPATH/pkg/mod/{原始path@version}
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
  
  // v0.1.19 新增：项目名称映射和显示顺序
  private projectNames = new Map<string, string>();    // projectRoot -> displayName
  private projectOrder: string[] = [];                 // 按 workspace folders 顺序排列的 projectRoot
  
  // 初始化项目信息（v0.1.19 更新：接受带名称的项目数组）
  initialize(projects: { root: string; name: string }[]): void;
  
  // 返回树节点的子节点
  getChildren(element?: TreeNode): Promise<TreeNode[]>;
  
  // 返回节点的 TreeItem 表示
  getTreeItem(element: TreeNode): vscode.TreeItem;
  
  // 返回节点的父节点（用于 reveal 定位）
  getParent(element: TreeNode): TreeNode | undefined;
  
  // 刷新整棵树（v0.1.19 更新：保持项目名称和顺序）
  refresh(): void;
  
  // 定位到指定文件路径（供 EditorTracker 调用）
  // preferredProjectRoot: 优先匹配的项目根目录，确保多项目工作空间下的精确定位
  // v0.1.11 修复：增加对 stdlibDeps 的遍历，确保标准库文件也能正确定位
  // v0.1.13 修复：当指定 preferredProjectRoot 但缓存未命中时，不 fallback 到其他项目缓存，直接通过 buildNodeChain 构建
  findNodeForFile(filePath: string, preferredProjectRoot?: string): { depNode?: DependencyNode; fileNode?: FileNode };
  
  // 构建完整节点链（含目录和文件）
  private buildNodeChain(root: string, dep: DependencyInfo, sourcePath: string, filePath?: string): { depNode: DependencyNode; fileNode?: FileNode };
  
  // 获取或创建节点，确保单例
  private getOrCreateNode<T extends TreeNode>(factory: () => T): T;
  
  // 新增 helper 方法：从文件节点向上查找所属的依赖包节点
  private findParentDep(node: TreeNode): DependencyNode | undefined;
}
```

**getChildren 逻辑**:
```
if (element === undefined):  // 根节点
    if (工作空间模式 && 多个项目):
        return ProjectNode[] (按 projectOrder 顺序排列，使用 projectNames 显示名称)
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
  displayName: string;       // v0.1.19 新增：来自 .code-workspace 的项目名称
  dependencies: DependencyInfo[];
}

// 分类节点
interface CategoryNode extends BaseNode {
  type: NodeType.Category;
  category: 'direct' | 'indirect' | 'stdlib';    // 新增 stdlib 类型
  projectRoot: string;
  dependencies: DependencyInfo[];
}

// 依赖包节点
interface DependencyNode extends BaseNode {
  type: NodeType.Dependency;
  dep: DependencyInfo;
  sourcePath: string;       // 实际源码路径
  // 节点 ID 设计：包含 projectRoot 前缀以区分不同项目
  // 格式：dep:${projectRoot}:${path}@${version}
}

// 目录节点
interface DirectoryNode extends BaseNode {
  type: NodeType.Directory;
  fsPath: string;
  dep: DependencyInfo;      // 所属依赖（用于定位）
  // 节点 ID 设计：包含 projectRoot 前缀以区分不同项目
  // ID 通过 resolveProjectRoot() 遍历 parent 链找到项目根目录
}

// 文件节点
interface FileNode extends BaseNode {
  type: NodeType.File;
  fsPath: string;
  dep: DependencyInfo;      // 所属依赖（用于定位）
  // 节点 ID 设计：包含 projectRoot 前缀以区分不同项目
  // ID 通过 resolveProjectRoot() 遍历 parent 链找到项目根目录
}

type TreeNode = ProjectNode | CategoryNode | DependencyNode | DirectoryNode | FileNode;

// 工具函数：从节点链中找到项目根目录
function resolveProjectRoot(node: TreeNode): string {
  let current: TreeNode | undefined = node;
  while (current) {
    if (current.type === NodeType.Project) {
      return current.projectRoot;
    }
    if (current.type === NodeType.Category) {
      return current.projectRoot;
    }
    current = current.parent;
  }
  throw new Error('Cannot resolve project root from node chain');
}
```

### 2.5 ReadonlyFileViewer (`readonlyFileViewer.ts`)

**职责**: 以只读方式打开依赖包文件

**v0.1.20 变更**: 从自定义 `go-dep:` scheme 改为原生 `file://` URI

```typescript
class ReadonlyFileViewer {
  // v0.1.20 简化：不再需要注册自定义 ContentProvider
  
  // 打开文件（只读，使用原生 file:// URI）
  async openFile(fsPath: string): Promise<void>;
}
```

**实现方案变更**:

**v0.1.20 之前（自定义 scheme）**:
```typescript
// 旧方案：使用自定义 URI scheme + TextDocumentContentProvider
const SCHEME = 'go-dep';

class DepFileContentProvider implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(uri: vscode.Uri): string {
    const fsPath = decodeURIComponent(uri.query);
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

**v0.1.20 新方案（原生 file:// URI）**:
```typescript
// 新方案：直接使用 vscode.Uri.file() 打开
class ReadonlyFileViewer {
  async openFile(fsPath: string): Promise<void> {
    const uri = vscode.Uri.file(fsPath);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { 
      preview: true,
      preserveFocus: false 
    });
  }
}
```

**变更优势**:
- **gopls 兼容性**: 原生 `file://` URI 能被 gopls 语言服务器正常索引
- **跳转支持**: 在依赖源码中能够 Cmd+Click 跳转到其他依赖/标准库
- **代码简化**: 移除自定义 TextDocumentContentProvider 和 go-dep: scheme
- **性能提升**: 直接使用 VSCode 原生文件系统，减少中间层

### 2.6 EditorTracker (`editorTracker.ts`)

**职责**: 监听编辑器切换，当用户跳转到依赖包代码时自动定位依赖树

**实现**:
```typescript
class EditorTracker {
  private outputChannel: vscode.OutputChannel;
  private lastProjectRoot: string | undefined;  // 追踪用户最后访问的项目根目录
  private gorootSrc: string | undefined;        // 缓存 $GOROOT/src 路径

  constructor(
    private treeView: vscode.TreeView<TreeNode>,
    private treeProvider: DependencyTreeProvider
  ) {
    this.outputChannel = vscode.window.createOutputChannel('Go Dependencies Explorer');
    // 初始化 GOROOT 缓存
    this.initGoroot();
    // 监听 active editor 变化
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) this.onEditorChanged(editor);
    });
  }
  
  // 初始化 GOROOT 路径缓存
  private async initGoroot(): Promise<void> {
    try {
      const { stdout } = await execAsync('go env GOROOT');
      this.gorootSrc = path.join(stdout.trim(), 'src');
    } catch (error) {
      this.outputChannel.appendLine(`Failed to get GOROOT: ${error}`);
    }
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
  
  // v0.1.11 修复：同步检查依赖文件，使用缓存的 gorootSrc
  private isDependencyFile(filePath: string): boolean {
    const gopath = process.env.GOPATH || path.join(os.homedir(), 'go');
    const modCachePath = path.join(gopath, 'pkg', 'mod');
    
    // 检查 mod cache 路径
    if (filePath.startsWith(modCachePath)) return true;
    
    // 检查 vendor 路径
    if (filePath.includes('/vendor/')) return true;
    
    // v0.1.11 修复：使用缓存的 gorootSrc 同步检查标准库路径
    if (this.gorootSrc && filePath.startsWith(this.gorootSrc)) return true;
    
    return false;
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
  
  // v0.2.0 新增：懒加载模式配置
  get lazyMode(): boolean {
    return vscode.workspace.getConfiguration('goDepsExplorer').get('lazyMode', false);
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

### 2.9 Lazy Mode 设计 (`dependencyTreeProvider.ts`)

**v0.2.0 新增**: 懒加载模式支持，初始依赖树为空，仅在用户跳转到依赖源码时才显示对应依赖包。

### 2.9.1 核心数据结构

```typescript
class DependencyTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  // v0.2.0 新增：懒加载状态管理
  private revealedDeps = new Set<string>();       // 已展示的依赖包集合
  private workspaceState?: vscode.Memento;        // VSCode 工作空间状态存储
  
  // 设置工作空间状态（用于持久化）
  setWorkspaceState(memento: vscode.Memento): void {
    this.workspaceState = memento;
    this.restoreRevealedDeps();
  }
  
  // 从 workspaceState 恢复已展示的依赖
  private restoreRevealedDeps(): void {
    const savedDeps = this.workspaceState?.get<string[]>('revealedDeps', []);
    if (savedDeps) {
      this.revealedDeps = new Set(savedDeps);
    }
  }
  
  // 添加依赖到已展示集合并持久化
  revealDep(root: string, dep: DependencyInfo): void {
    const depKey = this.createDepKey(root, dep);
    this.revealedDeps.add(depKey);
    this.persistRevealedDeps();
    this._onDidChangeTreeData.fire(undefined);
  }
  
  // 创建依赖的唯一标识 key
  private createDepKey(root: string, dep: DependencyInfo): string {
    return `${root}:${dep.path}@${dep.version}`;
  }
  
  // 持久化已展示的依赖到 workspaceState
  private persistRevealedDeps(): void {
    if (this.workspaceState) {
      this.workspaceState.update('revealedDeps', Array.from(this.revealedDeps));
    }
  }
}
```

### 2.9.2 getChildren 过滤逻辑

```typescript
getChildren(element?: TreeNode): Promise<TreeNode[]> {
  if (element?.type === NodeType.Category) {
    const category = element as CategoryNode;
    const config = this.configManager;
    
    // lazy mode 下过滤只显示 revealedDeps 中的依赖
    if (config.lazyMode) {
      return category.dependencies.filter(dep => {
        const depKey = this.createDepKey(category.projectRoot, dep);
        return this.revealedDeps.has(depKey);
      }).map(dep => this.createDependencyNode(dep, category));
    }
    
    // 非 lazy mode：显示所有依赖
    return category.dependencies.map(dep => this.createDependencyNode(dep, category));
  }
  
  // ... 其他节点类型处理逻辑 ...
}
```

### 2.9.3 buildCategories 分类过滤

```typescript
private buildCategories(projectRoot: string, deps: DependencyInfo[], stdlibDeps: DependencyInfo[]): CategoryNode[] {
  const config = this.configManager;
  const categories: CategoryNode[] = [];
  
  const directDeps = deps.filter(dep => !dep.indirect);
  const indirectDeps = deps.filter(dep => dep.indirect);
  
  // lazy mode 下：隐藏没有已展示依赖的 category
  if (config.lazyMode) {
    const hasRevealedDirect = directDeps.some(dep => 
      this.revealedDeps.has(this.createDepKey(projectRoot, dep))
    );
    const hasRevealedIndirect = indirectDeps.some(dep => 
      this.revealedDeps.has(this.createDepKey(projectRoot, dep))
    );
    const hasRevealedStdlib = stdlibDeps.some(dep => 
      this.revealedDeps.has(this.createDepKey(projectRoot, dep))
    );
    
    if (hasRevealedDirect) {
      categories.push(this.createCategoryNode('direct', projectRoot, directDeps));
    }
    if (hasRevealedIndirect) {
      categories.push(this.createCategoryNode('indirect', projectRoot, indirectDeps));
    }
    if (hasRevealedStdlib) {
      categories.push(this.createCategoryNode('stdlib', projectRoot, stdlibDeps));
    }
  } else {
    // 非 lazy mode：显示所有分类（原有逻辑）
    categories.push(this.createCategoryNode('direct', projectRoot, directDeps));
    if (config.showIndirect) {
      categories.push(this.createCategoryNode('indirect', projectRoot, indirectDeps));
    }
    categories.push(this.createCategoryNode('stdlib', projectRoot, stdlibDeps));
  }
  
  return categories;
}
```

### 2.9.4 Workspace Mode 项目过滤

```typescript
getChildren(element?: TreeNode): Promise<TreeNode[]> {
  if (element === undefined) {  // 根节点
    if (this.isWorkspaceMode && this.projects.length > 1) {
      // workspace mode 下：lazy mode 时隐藏没有已展示依赖的 project
      if (this.configManager.lazyMode) {
        return this.projects.filter(project => {
          return this.hasRevealedDepsInProject(project.root);
        }).map(project => this.createProjectNode(project));
      }
      // 非 lazy mode：显示所有项目
      return this.projects.map(project => this.createProjectNode(project));
    }
    
    // 单项目模式：返回分类节点
    const project = this.projects[0];
    return this.buildCategories(project.root, project.dependencies, project.stdlibDeps);
  }
  
  // ... 其他逻辑 ...
}

// 检查项目是否有已展示的依赖
private hasRevealedDepsInProject(projectRoot: string): boolean {
  const project = this.projects.find(p => p.root === projectRoot);
  if (!project) return false;
  
  const allDeps = [...project.dependencies, ...project.stdlibDeps];
  return allDeps.some(dep => {
    const depKey = this.createDepKey(projectRoot, dep);
    return this.revealedDeps.has(depKey);
  });
}
```

### 2.9.5 EditorTracker 触发流程

```typescript
// editorTracker.ts
class EditorTracker {
  private disposables: vscode.Disposable[] = [];           // v0.2.0 新增：管理所有订阅

  constructor(
    private treeView: vscode.TreeView<TreeNode>,
    private treeProvider: DependencyTreeProvider
  ) {
    this.outputChannel = vscode.window.createOutputChannel('Go Dependencies Explorer');
    // 初始化 GOROOT 缓存
    this.initGoroot();
    
    // 监听 active editor 变化
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) this.onEditorChanged(editor);
      })
    );
    
    // v0.2.0 新增：监听 TreeView 可见性变化
    this.disposables.push(
      this.treeView.onDidChangeVisibility(e => {
        if (e.visible) {
          this.checkCurrentEditorAndReveal();
        }
      })
    );
    
    // v0.2.0 新增：启动时延迟检查当前 editor
    setTimeout(() => {
      this.checkCurrentEditorAndReveal();
    }, 1000);
  }
  
  // v0.2.0 新增：检查当前 editor 并 reveal（用于启动和面板可见时）
  private async checkCurrentEditorAndReveal(): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      await this.onEditorChanged(activeEditor);
    }
  }
  
  private async onEditorChanged(editor: vscode.TextEditor): Promise<void> {
    const filePath = editor.document.uri.fsPath;
    
    // 跟踪 lastProjectRoot
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (workspaceFolder) {
      this.lastProjectRoot = workspaceFolder.uri.fsPath;
    }

    // 判断文件是否在某个依赖包路径下
    if (this.isDependencyFile(filePath)) {
      // 查找对应的依赖包和文件节点
      const result = this.treeProvider.findNodeForFile(filePath, this.lastProjectRoot);
      
      if (result?.depNode) {
        // v0.2.0 新增：触发依赖包显示
        this.treeProvider.revealDep(
          this.resolveProjectRoot(result.depNode), 
          result.depNode.dep
        );
        
        // 定位到文件节点
        if (result?.fileNode) {
          await this.treeView.reveal(result.fileNode, { select: true, focus: false, expand: false });
        }
      }
    }
  }
  
  // 从节点中解析项目根目录
  private resolveProjectRoot(node: DependencyNode): string {
    // 从节点的 parent 链中找到项目根目录
    let current: TreeNode | undefined = node;
    while (current) {
      if (current.type === NodeType.Project) {
        return (current as ProjectNode).projectRoot;
      }
      if (current.type === NodeType.Category) {
        return (current as CategoryNode).projectRoot;
      }
      current = current.parent;
    }
    throw new Error('Cannot resolve project root from dependency node');
  }
  
  // v0.2.0 新增：清理资源
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}
```

---

### 2.9.6 Extension 初始化

```typescript
// extension.ts
export async function activate(context: vscode.ExtensionContext) {
  // ... 其他初始化逻辑 ...
  
  // 创建 DependencyTreeProvider
  const treeProvider = new DependencyTreeProvider(configManager, goModParser);
  treeProvider.initialize(projects);
  
  // v0.2.0 新增：设置 workspaceState 用于持久化
  treeProvider.setWorkspaceState(context.workspaceState);
  
  // ... 其他注册逻辑 ...
}
```

### 2.10 动态 Stdlib 添加设计

**v0.2.0 新增**: 当用户跳转到 $GOROOT/src/ 下的标准库包，但该包不在初始 `go list -json ./...` 输出中时（如 internal/ 包），动态添加到标准库依赖列表。

```typescript
class DependencyTreeProvider {
  // 动态添加标准库依赖包
  addStdlibDep(projectRoot: string, pkgPath: string): void {
    const project = this.projects.find(p => p.root === projectRoot);
    if (!project) return;
    
    // 检查是否已存在
    const exists = project.stdlibDeps.some(dep => dep.path === pkgPath);
    if (exists) return;
    
    // 创建新的标准库依赖
    const stdlibDep: DependencyInfo = {
      path: pkgPath,
      version: 'stdlib',
      indirect: false,
      dir: path.join(this.goModParser.getGoRoot(), 'src', pkgPath)
    };
    
    project.stdlibDeps.push(stdlibDep);
    this.outputChannel.appendLine(`Dynamically added stdlib package: ${pkgPath}`);
  }
  
  // 增强 findNodeForFile：支持动态添加标准库包
  findNodeForFile(filePath: string, preferredProjectRoot?: string): { depNode?: DependencyNode; fileNode?: FileNode } {
    // ... 原有搜索逻辑 ...
    
    // v0.2.0 新增：动态标准库添加
    const gorootSrc = this.goModParser.getGoRoot() + '/src/';
    if (filePath.startsWith(gorootSrc)) {
      const relativePath = filePath.slice(gorootSrc.length);
      const pkgPath = this.extractPackageFromPath(relativePath);
      
      if (pkgPath && preferredProjectRoot) {
        // 动态添加到对应项目
        this.addStdlibDep(preferredProjectRoot, pkgPath);
        
        // 重新搜索
        return this.findNodeForFile(filePath, preferredProjectRoot);
      }
    }
    
    return {};
  }
  
  // 从文件路径提取包名（支持多级）
  private extractPackageFromPath(relativePath: string): string | null {
    // 示例: "net/http/server.go" → "net/http"
    // 示例: "internal/fmtsort/sort.go" → "internal/fmtsort"
    const parts = relativePath.split('/');
    if (parts.length < 1) return null;
    
    // 去掉文件名，保留目录路径
    if (parts[parts.length - 1].includes('.')) {
      parts.pop();
    }
    
    return parts.join('/');
  }
}
```

### 2.11 默认折叠状态设计

**v0.2.0 变更**: 所有树节点默认为折叠状态，而不是展开状态。

```typescript
class DependencyTreeProvider {
  // v0.2.0 变更：getTreeItem 默认折叠状态
  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.type === NodeType.Project) {
      const item = new vscode.TreeItem(
        element.displayName,
        vscode.TreeItemCollapsibleState.Collapsed  // v0.2.0: 默认折叠
      );
      // ... 其他属性设置 ...
      return item;
    }
    
    if (element.type === NodeType.Category) {
      const item = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.Collapsed  // v0.2.0: 默认折叠
      );
      // ... 其他属性设置 ...
      return item;
    }
    
    // ... 其他节点类型 ...
  }
}
```

### 2.12 buildNodeChain Stdlib 修复

**v0.2.0 修复**: `buildNodeChain` 现在正确检查 `dep.version === 'stdlib'`，确保标准库依赖放在 "Standard Library" 分类下。

```typescript
class DependencyTreeProvider {
  private buildNodeChain(root: string, dep: DependencyInfo, sourcePath: string, filePath?: string): { depNode: DependencyNode; fileNode?: FileNode } {
    // v0.2.0 修复：正确判断标准库依赖的分类
    const categoryType = dep.version === 'stdlib' ? 'stdlib' : (dep.indirect ? 'indirect' : 'direct');
    
    // 获取或创建分类节点
    const categoryNode = this.getOrCreateCategoryNode(categoryType, root);
    
    // 创建依赖节点
    const depNode = this.getOrCreateDependencyNode(dep, categoryNode, sourcePath);
    
    // 如果指定了文件路径，构建文件节点链
    if (filePath) {
      const fileNode = this.buildFileNodeChain(depNode, sourcePath, filePath);
      return { depNode, fileNode };
    }
    
    return { depNode };
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
   c. 调用 findGoProjects() 扫描工作区项目，返回 { root, name }[]
      - 单项目: vscode.workspace.workspaceFolders[0]，使用目录 basename 作为 name
      - 工作空间: 遍历所有 workspaceFolders，name 来自 folder.name（VSCode workspace folder API）
   d. 对每个项目执行 goModParser.parseDependencies(root)
   e. 创建 DependencyTreeProvider，传入依赖数据和项目名称信息
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
├── icon.png                     # 扩展图标（v0.2.1 新增）
├── tree-icon.svg                # 侧边栏自定义图标（v0.2.1 新增）
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
  "icon": "icon.png",
  "activationEvents": ["workspaceContains:**/go.mod"],
  "main": "./out/extension.js",
  "contributes": {
    "views": {
      "explorer": [{
        "id": "goDepsExplorer",
        "name": "Go Dependencies",
        "icon": "tree-icon.svg",
        "contextualTitle": "Go Deps Explorer",
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
        },
        "goDepsExplorer.lazyMode": {
          "type": "boolean",
          "default": false,
          "description": "启用懒加载模式（初始依赖树为空，Cmd+Click 跳转时才显示依赖）"
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

## 6. v0.1.11 版本变更设计说明

### 6.1 EditorTracker 重构

**问题描述**: 
- `isDependencyFile()` 方法中使用了 `Promise` 来检测 `GOROOT`，但该方法返回类型为 `boolean` 而非 `async`
- `Promise` 对象作为 truthy 值直接返回 `true`，导致后续的 fallback 逻辑永远不会执行

**修复方案**:
```typescript
class EditorTracker {
  private gorootSrc: string | undefined;  // 新增：缓存 GOROOT/src 路径

  constructor() {
    this.initGoroot();  // 构造时初始化 GOROOT 缓存
  }

  // 新增：异步初始化 GOROOT 路径
  private async initGoroot(): Promise<void> {
    try {
      const { stdout } = await execAsync('go env GOROOT');
      this.gorootSrc = path.join(stdout.trim(), 'src');
    } catch (error) {
      this.outputChannel.appendLine(`Failed to get GOROOT: ${error}`);
    }
  }

  // 修复：同步检查，使用缓存的 gorootSrc
  private isDependencyFile(filePath: string): boolean {
    // ... 其他检查逻辑 ...
    
    // 使用缓存的 gorootSrc 而非异步获取
    if (this.gorootSrc && filePath.startsWith(this.gorootSrc)) {
      return true;
    }
    
    return false;
  }
}
```

### 6.2 DependencyTreeProvider 标准库搜索

**问题描述**: 
- `findNodeForFile()` 方法只搜索 `this.projects`（模块依赖），不搜索 `this.stdlibDeps`（标准库依赖）
- 导致跳转到标准库代码时无法在依赖树中定位

**修复方案**:
```typescript
class DependencyTreeProvider {
  findNodeForFile(filePath: string, preferredProjectRoot?: string): { depNode?: DependencyNode; fileNode?: FileNode } {
    // 原有：搜索模块依赖
    for (const project of this.projects) {
      // ... 搜索逻辑 ...
    }
    
    // v0.1.11 新增：搜索标准库依赖
    for (const project of this.projects) {
      for (const stdlibDep of project.stdlibDeps) {
        if (filePath.startsWith(stdlibDep.sourcePath)) {
          // 找到匹配的标准库依赖，构建节点链
          return this.buildNodeChain(project.root, stdlibDep, stdlibDep.sourcePath, filePath);
        }
      }
    }
    
    return {};
  }
}
```

### 6.3 技术影响评估

| 变更项 | 影响范围 | 向后兼容性 |
|--------|----------|------------|
| EditorTracker.gorootSrc 缓存 | EditorTracker 模块内部 | 完全兼容 |
| initGoroot() 方法 | EditorTracker 构造流程 | 完全兼容 |
| isDependencyFile() 同步化 | 编辑器跳转响应速度 | 性能提升 |
| findNodeForFile() 标准库支持 | 标准库文件跳转定位 | 功能增强 |

## 7. 第三方依赖

| 包名 | 用途 | 说明 |
|------|------|------|
| `@types/vscode` | VSCode API 类型定义 | devDependency |
| `@types/node` | Node.js 类型定义 | devDependency |
| `typescript` | TypeScript 编译器 | devDependency |
| `@vscode/vsce` | 扩展打包发布工具 | devDependency |
| `eslint` + TS 插件 | 代码规范检查 | devDependency |

**无运行时依赖**：全部使用 VSCode 内置 API 和 Node.js 标准库。

## 8. 关键实现细节

### 8.1 获取直接/间接依赖

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

### 8.2 vendor vs $GOPATH/pkg/mod 判断

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

### 8.3 DependencyNode 的 TreeItem 表示

```typescript
// 依赖包根节点
getTreeItem(node: DependencyNode): vscode.TreeItem {
  const hasSource = fs.existsSync(node.sourcePath);
  const item = new vscode.TreeItem(
    `${node.dep.path}@${node.dep.version}`,
    hasSource ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
  );
  
  // 图标区分直接/间接/标准库/replace
  if (node.dep.replace && config.handleReplace) {
    // v0.1.14 修复：Replace 依赖图标和描述仅在 handleReplace=true 时显示
    item.iconPath = new vscode.ThemeIcon('arrow-swap');
    item.description = '→ replaced';
  } else if (node.category === 'stdlib') {
    // 标准库包使用内置图标
    item.iconPath = new vscode.ThemeIcon('library');
  } else {
    // 普通依赖包图标
    item.iconPath = node.dep.indirect
      ? new vscode.ThemeIcon('package', new vscode.ThemeColor('disabledForeground'))
      : new vscode.ThemeIcon('package');
  }
  
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

### 8.4 跳转定位的路径匹配

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

### 8.5 懒加载策略

- DependencyNode 初始 `collapsibleState = Collapsed`，不预加载子目录
- 用户展开时 `getChildren()` 才读取 `fs.readdir()`
- DirectoryNode 同理，逐层懒加载
- 文件/目录排序：目录在前、文件在后、各自按字母排序
- 隐藏不必要的文件：`.git/` 等（可配置）

---

## 9. v0.1.20 版本变更设计说明

### 9.1 ReadonlyFileViewer 架构简化

**变更动机**:
- **gopls 兼容性问题**: 自定义 `go-dep:` scheme 导致 gopls 无法索引依赖源码文件
- **用户体验限制**: 在依赖源码中无法进行 Cmd+Click 跳转到其他依赖
- **架构复杂性**: 自定义 TextDocumentContentProvider 增加了不必要的复杂度

**架构对比**:

**v0.1.19 架构（自定义 scheme）**:
```
用户点击文件
    ↓
goDepsExplorer.openFile 命令
    ↓
ReadonlyFileViewer.openFile()
    ↓
创建 go-dep:filename?fsPath URI
    ↓
VSCode 调用 DepFileContentProvider.provideTextDocumentContent()
    ↓
读取文件内容并返回字符串
    ↓
VSCode 显示只读文档（gopls 无法索引）
```

**v0.1.20 架构（原生 file:// URI）**:
```
用户点击文件
    ↓
goDepsExplorer.openFile 命令
    ↓
ReadonlyFileViewer.openFile()
    ↓
创建 vscode.Uri.file(fsPath)
    ↓
VSCode 直接打开文件（gopls 正常索引）
    ↓
支持完整的语言服务功能（跳转、高亮、智能提示）
```

### 9.2 技术实现变更

**移除的组件**:
- `DepFileContentProvider` 类
- 自定义 `go-dep:` URI scheme 注册
- `TextDocumentContentProvider` 接口实现
- URI query 参数编解码逻辑

**简化的实现**:
```typescript
class ReadonlyFileViewer {
  // v0.1.20: 大幅简化的实现
  async openFile(fsPath: string): Promise<void> {
    const uri = vscode.Uri.file(fsPath);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { 
      preview: true,
      preserveFocus: false 
    });
  }
}
```

### 9.3 用户体验提升

| 功能项 | v0.1.19 (自定义 scheme) | v0.1.20 (原生 file://) |
|--------|------------------------|------------------------|
| **语法高亮** | ✅ 基础高亮 | ✅ 完整的 gopls 高亮 |
| **智能提示** | ❌ 不支持 | ✅ 完整的代码提示 |
| **跳转到定义** | ❌ 不支持 | ✅ Cmd+Click 跳转支持 |
| **代码补全** | ❌ 不支持 | ✅ 完整的自动补全 |
| **错误提示** | ❌ 不支持 | ✅ 实时错误检测 |
| **依赖间跳转** | ❌ 不支持 | ✅ 跨依赖跳转并定位 |

### 9.4 向后兼容性

**完全兼容**: 此次变更不影响任何用户可见的API或配置项，仅为内部实现的重构。

**用户体验改进**: 用户将获得更好的代码编辑体验，但操作方式保持不变。

---

## 10. v0.2.1~v0.2.3 图标实现设计

### 10.1 v0.2.1 - 插件图标实现

#### 12.1.1 扩展图标 (icon.png)

**技术规格**:
- **尺寸**: 128x128px PNG 格式
- **设计元素**: Go 蓝色圆形背景 + 白色依赖树图案
- **颜色方案**: 
  - 背景：Go 官方蓝色 (#00ADD8)
  - 图案：白色 (#FFFFFF)
- **用途**: 扩展市场展示、扩展管理器图标

**package.json 配置**:
```json
{
  "icon": "icon.png"
}
```

#### 12.1.2 侧边栏图标 (tree-icon.svg)

**技术规格**:
- **格式**: SVG 矢量图标
- **设计**: 自定义树形结构图案，简洁清晰
- **用途**: Activity Bar 和侧边栏面板图标，替代默认文件图标

**package.json 配置**:
```json
{
  "contributes": {
    "views": {
      "explorer": [{
        "id": "goDepsExplorer",
        "name": "Go Dependencies",
        "icon": "tree-icon.svg"
      }]
    }
  }
}
```

### 10.2 v0.2.2 - 图标微调

#### 12.2.1 tree-icon.svg 视觉优化

**调整内容**:
- 树形竖线上下延长，增强视觉连贯性
- 优化线条粗细和间距，提升在小尺寸下的清晰度
- 调整节点大小和位置，确保视觉平衡

**实现方式**:
```svg
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <!-- 优化后的树形结构路径 -->
  <path d="M3,2 L3,22 M3,6 L8,6 M3,12 L8,12 M8,12 L8,18 M8,15 L13,15 M8,18 L13,18" 
        stroke="currentColor" 
        stroke-width="1.5" 
        fill="none"/>
  <!-- 节点圆点 -->
  <circle cx="8" cy="6" r="2" fill="currentColor"/>
  <circle cx="13" cy="15" r="2" fill="currentColor"/>
  <circle cx="13" cy="18" r="2" fill="currentColor"/>
</svg>
```

### 10.3 v0.2.3 - 侧边栏提示修复

#### 12.3.1 contextualTitle 实现

**问题描述**:
- 用户将面板拖拽到侧边栏后，鼠标悬浮显示"资源管理器"而非插件名称
- 影响用户对插件功能的识别和理解

**解决方案**:
```json
{
  "contributes": {
    "views": {
      "explorer": [{
        "id": "goDepsExplorer",
        "name": "Go Dependencies", 
        "icon": "tree-icon.svg",
        "contextualTitle": "Go Deps Explorer"
      }]
    }
  }
}
```

**效果**:
- 拖拽到侧边栏后，悬浮提示显示"Go Deps Explorer"
- 提升用户体验和插件品牌识别度
- 保持与插件功能的一致性

### 10.4 文件资源管理

#### 12.4.1 图标文件位置
```
code/
├── icon.png              # 扩展主图标（128x128px）
├── tree-icon.svg         # 侧边栏图标（矢量）
└── resources/
    └── icons/             # 其他内置图标资源
        ├── dependency.svg
        ├── dependency-indirect.svg
        └── ...
```

#### 12.4.2 构建和发布

**构建配置** (.vscodeignore):
```
# 确保图标文件包含在发布包中
!icon.png
!tree-icon.svg
```

**版本管理**:
- v0.2.1: 新增两个图标文件
- v0.2.2: 仅更新 tree-icon.svg 内容
- v0.2.3: 仅更新 package.json 配置，无新文件

---

**技术约束**:
- VSCode 支持的图标格式：PNG (扩展图标)、SVG (视图图标)
- 图标文件必须位于扩展根目录或被正确引用
- SVG 图标自动支持主题色彩适配 (currentColor)
- PNG 图标建议提供高分辨率版本适配高 DPI 显示器
## 11. v0.2.4 会话级只读模式设计

### 11.1 功能恢复背景

**v0.1.20 变更**: 从自定义 `go-dep:` scheme 迁移到原生 `file://` URI 以支持 gopls 语言服务器。

**丢失功能**: 只读模式功能丢失，用户可以修改依赖源码文件。

**v0.2.4 目标**: 恢复只读模式，但使用会话级只读而非文件级只读。

### 11.2 会话级只读实现

**核心机制**: 使用 VS Code 内置命令 `workbench.action.files.setActiveEditorReadonlyInSession`

**技术优势**:
- **会话级**: 文件仅在当前 VS Code 会话中只读，重新打开后可正常编辑
- **无副作用**: 不修改文件系统权限，不影响其他编辑器
- **gopls 兼容**: 保持 `file://` URI，语言服务器正常工作

```typescript
class ReadonlyFileViewer {
  async openFile(fsPath: string): Promise<void> {
    const uri = vscode.Uri.file(fsPath);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { 
      preview: true,
      preserveFocus: false 
    });
    
    // v0.2.4 新增：设置会话级只读
    try {
      await vscode.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession');
    } catch (error) {
      // 兼容旧版 VS Code (< 1.79)，命令不存在时静默忽略
      this.outputChannel?.appendLine(`SetReadonly command not available: ${error}`);
    }
  }
}
```

### 11.3 版本兼容性设计

**目标版本**: VS Code 1.79+ 支持该命令

**兼容策略**: try/catch 包裹，命令不存在时静默降级

**降级行为**:
- VS Code 1.79+: 文件标记为会话级只读
- VS Code < 1.79: 文件可编辑（与 v0.1.20 行为一致）

**错误处理**:
```typescript
try {
  await vscode.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession');
} catch (error) {
  // 记录到 Output Channel，但不影响用户体验
  if (error.message.includes('command not found') || 
      error.message.includes('not available')) {
    // 预期的兼容性问题，静默处理
    this.outputChannel?.appendLine(`Session readonly not supported in this VS Code version`);
  } else {
    // 意外错误，记录详细信息
    this.outputChannel?.appendLine(`Failed to set readonly: ${error}`);
  }
}
```

### 11.4 用户体验对比

| 版本 | 只读模式 | gopls 支持 | 兼容性 |
|------|---------|------------|--------|
| **v0.1.19** | ✅ 完全只读（自定义 scheme） | ❌ 无语言服务器支持 | 全版本 |
| **v0.1.20** | ❌ 可编辑 | ✅ 完整语言服务器支持 | 全版本 |
| **v0.2.4** | ✅ 会话级只读 | ✅ 完整语言服务器支持 | VS Code 1.79+ |

### 11.5 实现位置

**文件**: `src/readonlyFileViewer.ts`

**修改点**: `openFile()` 方法在 `showTextDocument()` 后添加命令调用

**影响范围**: 仅影响依赖源码文件打开流程，不影响其他功能

