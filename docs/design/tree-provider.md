# DependencyTreeProvider 核心模块设计

## 修订记录
| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0  | 2026-03-20 | DEV | 基于v0.2.5源码重构核心模块文档 |

## 1. 模块概述

### 1.1 职责定义
DependencyTreeProvider是扩展的核心模块，实现`vscode.TreeDataProvider<TreeNode>`接口，负责：
- 驱动VSCode侧边栏依赖树的数据展示
- 管理树节点的生命周期和缓存
- 支持懒加载模式和工作区模式
- 处理用户交互事件和数据刷新

### 1.2 技术架构
```typescript
class DependencyTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  // VSCode TreeDataProvider 必需接口
  getChildren(element?: TreeNode): Promise<TreeNode[]>
  getTreeItem(element: TreeNode): vscode.TreeItem
  getParent(element: TreeNode): TreeNode | undefined
  
  // 数据变更事件
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
}
```

## 2. 核心数据结构

### 2.1 内部状态管理

```typescript
class DependencyTreeProvider {
  // 项目依赖数据：projectRoot → 依赖列表
  private projects: Map<string, DependencyInfo[]> = new Map();
  private stdlibDeps: Map<string, DependencyInfo[]> = new Map();
  
  // 工作区配置
  private isWorkspace = false;           // 是否多项目工作区
  private projectOrder: string[] = [];   // 项目显示顺序
  private projectNames: Map<string, string> = new Map(); // 项目显示名称
  
  // 节点缓存系统
  private nodeMap = new Map<string, TreeNode>();
  
  // Lazy Mode 状态（v0.2.0）
  private revealedDeps = new Set<string>();      // 已展示的依赖包集合
  private workspaceState: vscode.Memento;       // VSCode工作区状态持久化
}
```

### 2.2 项目数据结构

```typescript
// 初始化时接收的项目信息
interface ProjectInfo {
  root: string;  // 项目根目录绝对路径
  name: string;  // 项目显示名称（来自workspace folder）
}

// 内部依赖分类
type CategoryType = 'direct' | 'indirect' | 'stdlib';
```

## 3. 核心方法实现

### 3.1 初始化流程

```typescript
async initialize(projects: ProjectInfo[]): Promise<void> {
  this.isWorkspace = projects.length > 1;
  this.projectOrder = projects.map(p => p.root);
  
  // 设置项目显示名称映射
  for (const { root, name } of projects) {
    this.projectNames.set(root, name);
    
    try {
      // 解析模块依赖
      const deps = await this.parser.parseDependencies(root);
      this.projects.set(root, deps);
      
      // 解析标准库依赖
      const stdlibDeps = await this.parser.parseStdlibDeps(root);
      this.stdlibDeps.set(root, stdlibDeps);
    } catch (e) {
      // 错误处理：设置空依赖列表
      console.error(`Failed to parse dependencies for ${root}:`, e);
      this.projects.set(root, []);
      this.stdlibDeps.set(root, []);
    }
  }
}
```

### 3.2 树节点获取逻辑

```typescript
getChildren(element?: TreeNode): Promise<TreeNode[]> {
  if (element === undefined) {
    // 根节点：返回项目节点或直接返回分类节点
    return this.getRootChildren();
  }
  
  switch (element.type) {
    case NodeType.Project:
      return this.getProjectChildren(element as ProjectNode);
    case NodeType.Category:
      return this.getCategoryChildren(element as CategoryNode);
    case NodeType.Dependency:
      return this.getDependencyChildren(element as DependencyNode);
    case NodeType.Directory:
      return this.getDirectoryChildren(element as DirectoryNode);
    case NodeType.File:
      return Promise.resolve([]); // 叶子节点
  }
}

private getRootChildren(): Promise<TreeNode[]> {
  if (this.isWorkspace && this.projectOrder.length > 1) {
    // 多项目工作区：返回项目节点
    return Promise.resolve(
      this.projectOrder
        .filter(root => this.shouldShowProject(root))  // Lazy Mode 过滤
        .map(root => this.getOrCreateProjectNode(root))
    );
  } else {
    // 单项目模式：直接返回分类节点
    const projectRoot = this.projectOrder[0];
    return Promise.resolve(this.buildCategoryNodes(projectRoot));
  }
}
```

### 3.3 分类节点构建

```typescript
private buildCategoryNodes(projectRoot: string): CategoryNode[] {
  const deps = this.projects.get(projectRoot) || [];
  const stdlibDeps = this.stdlibDeps.get(projectRoot) || [];
  
  const directDeps = deps.filter(dep => !dep.indirect);
  const indirectDeps = deps.filter(dep => dep.indirect);
  
  const categories: CategoryNode[] = [];
  
  // Lazy Mode 过滤逻辑
  if (this.config.lazyMode) {
    // 只显示有已展示依赖的分类
    if (this.hasRevealedDepsInCategory(projectRoot, directDeps)) {
      categories.push(this.createCategoryNode('direct', projectRoot, directDeps));
    }
    if (this.hasRevealedDepsInCategory(projectRoot, indirectDeps)) {
      categories.push(this.createCategoryNode('indirect', projectRoot, indirectDeps));
    }
    if (this.hasRevealedDepsInCategory(projectRoot, stdlibDeps)) {
      categories.push(this.createCategoryNode('stdlib', projectRoot, stdlibDeps));
    }
  } else {
    // 非 Lazy Mode：显示所有分类
    categories.push(this.createCategoryNode('direct', projectRoot, directDeps));
    
    if (this.config.showIndirect) {
      categories.push(this.createCategoryNode('indirect', projectRoot, indirectDeps));
    }
    
    categories.push(this.createCategoryNode('stdlib', projectRoot, stdlibDeps));
  }
  
  return categories;
}
```

### 3.4 依赖节点文件系统展开

```typescript
private async getDependencyChildren(dep: DependencyNode): Promise<TreeNode[]> {
  if (!fs.existsSync(dep.sourcePath)) {
    return []; // 源码不存在
  }
  
  try {
    const entries = await fs.promises.readdir(dep.sourcePath, { withFileTypes: true });
    const children: TreeNode[] = [];
    
    // 分离目录和文件
    const directories = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));
    const files = entries.filter(e => e.isFile() && e.name.endsWith('.go'));
    
    // 先添加目录节点（按字母排序）
    for (const dir of directories.sort((a, b) => a.name.localeCompare(b.name))) {
      const dirPath = path.join(dep.sourcePath, dir.name);
      const dirNode = this.getOrCreateDirectoryNode(dir.name, dirPath, dep.dep, dep);
      children.push(dirNode);
    }
    
    // 再添加文件节点（按字母排序）
    for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
      const filePath = path.join(dep.sourcePath, file.name);
      const fileNode = this.getOrCreateFileNode(file.name, filePath, dep.dep, dep);
      children.push(fileNode);
    }
    
    return children;
  } catch (error) {
    console.error(`Failed to read directory ${dep.sourcePath}:`, error);
    return [];
  }
}
```

## 4. Lazy Mode 设计（v0.2.0）

### 4.1 核心机制

```typescript
// 依赖包唯一标识
private createDepKey(root: string, dep: DependencyInfo): string {
  return `${root}:${dep.path}@${dep.version}`;
}

// 添加依赖到已展示集合
revealDep(root: string, dep: DependencyInfo): void {
  if (!this.config.lazyMode) return;
  
  const depKey = this.createDepKey(root, dep);
  if (this.revealedDeps.has(depKey)) return;
  
  this.revealedDeps.add(depKey);
  this.saveRevealedDeps();
  this._onDidChangeTreeData.fire(); // 触发UI刷新
}

// 持久化到工作区状态
private saveRevealedDeps(): void {
  this.workspaceState?.update('revealedDeps', Array.from(this.revealedDeps));
}
```

### 4.2 过滤机制

```typescript
private hasRevealedDepsInCategory(root: string, deps: DependencyInfo[]): boolean {
  return deps.some(dep => {
    const depKey = this.createDepKey(root, dep);
    return this.revealedDeps.has(depKey);
  });
}

private filterRevealedDeps(root: string, deps: DependencyInfo[]): DependencyInfo[] {
  return deps.filter(dep => {
    const depKey = this.createDepKey(root, dep);
    return this.revealedDeps.has(depKey);
  });
}
```

## 5. 节点缓存系统

### 5.1 统一节点管理

```typescript
private nodeMap = new Map<string, TreeNode>();

// 确保节点唯一性的工厂方法
private getOrCreateNode<T extends TreeNode>(factory: () => T): T {
  const node = factory();
  const existing = this.nodeMap.get(node.id);
  if (existing) {
    return existing as T;
  }
  this.nodeMap.set(node.id, node);
  return node;
}

// 具体节点创建方法示例
private getOrCreateDependencyNode(dep: DependencyInfo, parent: CategoryNode, sourcePath: string): DependencyNode {
  return this.getOrCreateNode(() => new DependencyNode(dep, sourcePath, parent));
}
```

### 5.2 缓存优势
- **内存效率**：避免重复创建相同节点实例
- **引用一致性**：确保`reveal()`等操作使用正确的节点引用
- **状态保持**：节点状态（展开/收缩）在刷新后保持

## 6. 文件跳转定位

### 6.1 findNodeForFile 核心算法

```typescript
findNodeForFile(filePath: string, preferredProjectRoot?: string): { depNode?: DependencyNode; fileNode?: FileNode } {
  // 优先搜索指定项目
  if (preferredProjectRoot) {
    const result = this.searchFileInProject(filePath, preferredProjectRoot);
    if (result) return result;
  }
  
  // 搜索所有项目（cache命中）
  for (const projectRoot of this.projectOrder) {
    if (projectRoot === preferredProjectRoot) continue; // 避免重复搜索
    const result = this.searchFileInProject(filePath, projectRoot);
    if (result) return result;
  }
  
  // 动态构建节点链（适用于标准库动态添加等场景）
  return this.buildNodeChainForFile(filePath, preferredProjectRoot);
}

private searchFileInProject(filePath: string, projectRoot: string): { depNode?: DependencyNode; fileNode?: FileNode } | null {
  // 搜索模块依赖
  const moduleDeps = this.projects.get(projectRoot) || [];
  for (const dep of moduleDeps) {
    const sourcePath = this.parser.getSourcePath(dep, projectRoot);
    if (filePath.startsWith(sourcePath)) {
      return this.buildNodeChain(projectRoot, dep, sourcePath, filePath);
    }
  }
  
  // 搜索标准库依赖
  const stdlibDeps = this.stdlibDeps.get(projectRoot) || [];
  for (const dep of stdlibDeps) {
    const sourcePath = this.parser.getStdlibSourcePath(dep.path);
    if (filePath.startsWith(sourcePath)) {
      return this.buildNodeChain(projectRoot, dep, sourcePath, filePath);
    }
  }
  
  return null;
}
```

### 6.2 动态标准库添加

```typescript
addStdlibDep(root: string, dep: DependencyInfo): void {
  let stdlibList = this.stdlibDeps.get(root);
  if (!stdlibList) {
    stdlibList = [];
    this.stdlibDeps.set(root, stdlibList);
  }
  
  // 检查是否已存在
  if (!stdlibList.some(d => d.path === dep.path)) {
    stdlibList.push(dep);
    this._onDidChangeTreeData.fire();
  }
}
```

## 7. TreeItem 渲染配置

### 7.1 节点图标和状态

```typescript
getTreeItem(element: TreeNode): vscode.TreeItem {
  switch (element.type) {
    case NodeType.Dependency:
      return this.createDependencyTreeItem(element as DependencyNode);
    case NodeType.Directory:
      return this.createDirectoryTreeItem(element as DirectoryNode);
    case NodeType.File:
      return this.createFileTreeItem(element as FileNode);
    // ...
  }
}

private createDependencyTreeItem(node: DependencyNode): vscode.TreeItem {
  const hasSource = fs.existsSync(node.sourcePath);
  const item = new vscode.TreeItem(
    node.label,
    hasSource ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
  );
  
  // 图标选择逻辑
  if (node.dep.replace && this.config.handleReplace) {
    item.iconPath = new vscode.ThemeIcon('arrow-swap');
    item.description = '→ replaced';
  } else if (node.dep.version === 'stdlib') {
    item.iconPath = new vscode.ThemeIcon('library');
  } else {
    item.iconPath = node.dep.indirect
      ? new vscode.ThemeIcon('package', new vscode.ThemeColor('disabledForeground'))
      : new vscode.ThemeIcon('package');
  }
  
  // 悬停提示
  item.tooltip = this.createDependencyTooltip(node.dep);
  
  return item;
}
```

### 7.2 命令绑定

```typescript
private createFileTreeItem(node: FileNode): vscode.TreeItem {
  const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
  
  // 绑定打开文件命令
  item.command = {
    command: 'goDepsExplorer.openFile',
    title: 'Open File',
    arguments: [node.fsPath]
  };
  
  item.iconPath = new vscode.ThemeIcon('file-code');
  item.contextValue = 'file';
  
  return item;
}
```

## 8. 性能优化策略

### 8.1 懒加载机制
- **目录延迟读取**：只有用户展开时才读取目录内容
- **大依赖优化**：大型依赖包的子目录按需加载

### 8.2 事件防抖
```typescript
refresh(): void {
  // 清除缓存
  this.nodeMap.clear();
  // 触发数据重新加载
  this._onDidChangeTreeData.fire();
}
```

### 8.3 内存管理
- **节点缓存复用**：相同ID的节点只创建一次
- **弱引用清理**：不再使用的节点会被垃圾回收