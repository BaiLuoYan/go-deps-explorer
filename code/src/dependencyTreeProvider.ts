import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  TreeNode, ProjectNode, CategoryNode, DependencyNode,
  DirectoryNode, FileNode, DependencyInfo, NodeType,
} from './models';
import { GoModParser } from './goModParser';
import { ConfigManager } from './configManager';

export class DependencyTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private projects: Map<string, DependencyInfo[]> = new Map();
  private isWorkspace = false;

  // 节点缓存 - 确保 reveal 能找到真实的节点引用
  private categoryCache = new Map<string, CategoryNode>();
  private dependencyCache = new Map<string, DependencyNode>();
  private directoryCache = new Map<string, DirectoryNode>();
  private fileCache = new Map<string, FileNode>();

  constructor(
    private parser: GoModParser,
    private config: ConfigManager,
  ) {}

  async initialize(projectRoots: string[]): Promise<void> {
    this.isWorkspace = projectRoots.length > 1;
    for (const root of projectRoots) {
      try {
        const deps = await this.parser.parseDependencies(root);
        this.projects.set(root, deps);
      } catch (e) {
        console.error(`Failed to parse dependencies for ${root}:`, e);
        this.projects.set(root, []);
      }
    }
  }

  refresh(): void {
    // 清空所有缓存
    this.categoryCache.clear();
    this.dependencyCache.clear();
    this.directoryCache.clear();
    this.fileCache.clear();
    
    // Re-scan all projects
    const roots = Array.from(this.projects.keys());
    this.projects.clear();
    this.initialize(roots).then(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    switch (element.type) {
      case NodeType.Project: {
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
        item.iconPath = new vscode.ThemeIcon('root-folder');
        item.contextValue = 'project';
        return item;
      }
      case NodeType.Category: {
        const label = element.category === 'direct' ? '直接依赖' : '间接依赖';
        const count = element.dependencies.filter(d =>
          element.category === 'direct' ? !d.indirect : d.indirect
        ).length;
        const item = new vscode.TreeItem(
          `${label} (${count})`,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.iconPath = element.category === 'direct'
          ? new vscode.ThemeIcon('folder-library')
          : new vscode.ThemeIcon('folder');
        item.contextValue = `category-${element.category}`;
        return item;
      }
      case NodeType.Dependency: {
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
        item.iconPath = element.dep.indirect
          ? new vscode.ThemeIcon('package', new vscode.ThemeColor('disabledForeground'))
          : new vscode.ThemeIcon('package');
        item.tooltip = this.buildDepTooltip(element);
        item.contextValue = element.dep.indirect ? 'dependency-indirect' : 'dependency-direct';
        return item;
      }
      case NodeType.Directory: {
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
        item.iconPath = vscode.ThemeIcon.Folder;
        item.resourceUri = vscode.Uri.file(element.fsPath);
        return item;
      }
      case NodeType.File: {
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
        item.iconPath = vscode.ThemeIcon.File;
        item.resourceUri = vscode.Uri.file(element.fsPath);
        item.command = {
          command: 'goDepsExplorer.openFile',
          title: 'Open File',
          arguments: [element.fsPath],
        };
        return item;
      }
    }
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (!element) {
      // Root level
      if (this.isWorkspace) {
        return Array.from(this.projects.entries()).map(([root, deps]) =>
          new ProjectNode(path.basename(root), root, deps)
        );
      } else {
        // Single project: show categories directly
        const entry = Array.from(this.projects.entries())[0];
        if (!entry) { return []; }
        const [root, deps] = entry;
        return this.buildCategories(root, deps, undefined);
      }
    }

    if (element instanceof ProjectNode) {
      return this.buildCategories(element.projectRoot, element.dependencies, element);
    }

    if (element instanceof CategoryNode) {
      const filtered = element.dependencies.filter(d =>
        element.category === 'direct' ? !d.indirect : d.indirect
      );
      return filtered
        .sort((a, b) => a.path.localeCompare(b.path))
        .map(dep => {
          const sourcePath = this.parser.getSourcePath(dep, element.projectRoot);
          const cacheKey = `${dep.path}@${dep.version}`;
          
          // 使用缓存或创建新节点
          let depNode = this.dependencyCache.get(cacheKey);
          if (!depNode) {
            depNode = new DependencyNode(dep, sourcePath, element);
            this.dependencyCache.set(cacheKey, depNode);
          }
          return depNode;
        });
    }

    if (element instanceof DependencyNode) {
      return this.readDirectory(element.sourcePath, element.dep, element);
    }

    if (element instanceof DirectoryNode) {
      return this.readDirectory(element.fsPath, element.dep, element);
    }

    return [];
  }

  getParent(element: TreeNode): TreeNode | undefined {
    if (element instanceof CategoryNode) { return element.parent; }
    if (element instanceof DependencyNode) { return element.parent; }
    if (element instanceof DirectoryNode) { return element.parent; }
    if (element instanceof FileNode) { return element.parent; }
    return undefined;
  }

  /** Find and return the cached nodes for a given absolute file path */
  findNodeForFile(filePath: string): { depNode?: DependencyNode; fileNode?: FileNode } | undefined {
    // 首先检查是否已有缓存的文件节点
    const cachedFileNode = this.fileCache.get(filePath);
    if (cachedFileNode) {
      // 找到对应的依赖节点
      const depCacheKey = `${cachedFileNode.dep.path}@${cachedFileNode.dep.version}`;
      const cachedDepNode = this.dependencyCache.get(depCacheKey);
      if (cachedDepNode) {
        return { depNode: cachedDepNode, fileNode: cachedFileNode };
      }
    }

    // 如果文件节点未缓存，尝试找到对应的依赖节点
    for (const [root, deps] of this.projects) {
      for (const dep of deps) {
        const sourcePath = this.parser.getSourcePath(dep, root);
        if (filePath.startsWith(sourcePath + path.sep) || filePath === sourcePath) {
          const depCacheKey = `${dep.path}@${dep.version}`;
          const cachedDepNode = this.dependencyCache.get(depCacheKey);
          if (cachedDepNode) {
            return { depNode: cachedDepNode };
          }
          // 如果依赖节点也未缓存，说明树未展开到该层级，先返回 undefined
          return undefined;
        }
      }
    }
    return undefined;
  }

  private buildCategories(
    projectRoot: string,
    deps: DependencyInfo[],
    parent: ProjectNode | undefined,
  ): TreeNode[] {
    const categories: TreeNode[] = [];
    const directDeps = deps.filter(d => !d.indirect);
    const indirectDeps = deps.filter(d => d.indirect);

    if (directDeps.length > 0) {
      const cacheKey = `${projectRoot}:direct`;
      let categoryNode = this.categoryCache.get(cacheKey);
      if (!categoryNode) {
        categoryNode = new CategoryNode('直接依赖', 'direct', projectRoot, deps, parent);
        this.categoryCache.set(cacheKey, categoryNode);
      }
      categories.push(categoryNode);
    }
    if (this.config.showIndirect && indirectDeps.length > 0) {
      const cacheKey = `${projectRoot}:indirect`;
      let categoryNode = this.categoryCache.get(cacheKey);
      if (!categoryNode) {
        categoryNode = new CategoryNode('间接依赖', 'indirect', projectRoot, deps, parent);
        this.categoryCache.set(cacheKey, categoryNode);
      }
      categories.push(categoryNode);
    }
    return categories;
  }

  private readDirectory(dirPath: string, dep: DependencyInfo, parent: TreeNode): TreeNode[] {
    if (!fs.existsSync(dirPath)) { return []; }
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const dirs: DirectoryNode[] = [];
      const files: FileNode[] = [];
      for (const entry of entries) {
        if (entry.name.startsWith('.')) { continue; } // Skip hidden files
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          // 使用缓存或创建新的目录节点
          let dirNode = this.directoryCache.get(fullPath);
          if (!dirNode) {
            dirNode = new DirectoryNode(entry.name, fullPath, dep, parent);
            this.directoryCache.set(fullPath, dirNode);
          }
          dirs.push(dirNode);
        } else {
          // 使用缓存或创建新的文件节点
          let fileNode = this.fileCache.get(fullPath);
          if (!fileNode) {
            fileNode = new FileNode(entry.name, fullPath, dep, parent);
            this.fileCache.set(fullPath, fileNode);
          }
          files.push(fileNode);
        }
      }
      dirs.sort((a, b) => a.label.localeCompare(b.label));
      files.sort((a, b) => a.label.localeCompare(b.label));
      return [...dirs, ...files];
    } catch {
      return [];
    }
  }

  private buildDepTooltip(node: DependencyNode): vscode.MarkdownString {
    const dep = node.dep;
    const lines = [
      `**${dep.path}**`,
      ``,
      `版本: \`${dep.version}\``,
      `类型: ${dep.indirect ? '间接依赖' : '直接依赖'}`,
      `路径: \`${node.sourcePath}\``,
    ];
    if (dep.replace) {
      lines.push(``);
      lines.push(`**Replace:**`);
      lines.push(`→ ${dep.replace.path}${dep.replace.version ? '@' + dep.replace.version : ''}`);
      if (dep.replace.dir) { lines.push(`路径: \`${dep.replace.dir}\``); }
    }
    if (dep.goVersion) {
      lines.push(`Go 版本: \`${dep.goVersion}\``);
    }
    // URL guess
    if (dep.path.startsWith('github.com/') || dep.path.startsWith('gitlab.com/')) {
      lines.push(``);
      lines.push(`🔗 [https://${dep.path}](https://${dep.path})`);
    }
    const md = new vscode.MarkdownString(lines.join('\n'));
    md.isTrusted = true;
    return md;
  }
}
