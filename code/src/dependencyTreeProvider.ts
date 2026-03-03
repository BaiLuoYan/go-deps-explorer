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
  private stdlibDeps: Map<string, DependencyInfo[]> = new Map();
  private isWorkspace = false;

  // 统一的节点管理器 - 确保每个节点只有一个实例
  private nodeMap = new Map<string, TreeNode>();

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
        
        // Also parse stdlib dependencies
        const stdlibDeps = await this.parser.parseStdlibDeps(root);
        this.stdlibDeps.set(root, stdlibDeps);
      } catch (e) {
        console.error(`Failed to parse dependencies for ${root}:`, e);
        this.projects.set(root, []);
        this.stdlibDeps.set(root, []);
      }
    }
  }

  refresh(): void {
    // 清空节点映射表
    this.nodeMap.clear();
    
    // Re-scan all projects
    const roots = Array.from(this.projects.keys());
    this.projects.clear();
    this.stdlibDeps.clear();
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
        let label: string;
        let iconName: string;
        
        if (element.category === 'direct') {
          label = 'Direct Dependencies';
          iconName = 'folder-library';
        } else if (element.category === 'indirect') {
          label = 'Indirect Dependencies';
          iconName = 'folder';
        } else { // stdlib
          label = 'Standard Library';
          iconName = 'symbol-package';
        }
        
        const count = element.category === 'stdlib' 
          ? element.dependencies.length
          : element.dependencies.filter(d => element.category === 'direct' ? !d.indirect : d.indirect).length;
        
        const item = new vscode.TreeItem(
          `${label} (${count})`,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.iconPath = new vscode.ThemeIcon(iconName);
        item.contextValue = `category-${element.category}`;
        return item;
      }
      case NodeType.Dependency: {
        const hasSource = fs.existsSync(element.sourcePath);
        const item = new vscode.TreeItem(
          element.label,
          hasSource ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
        );
        
        // Set icon based on dependency type and replace status
        if (element.dep.replace) {
          item.iconPath = new vscode.ThemeIcon('arrow-swap');
          item.description = '→ replaced';
        } else if (element.dep.version === 'stdlib') {
          item.iconPath = new vscode.ThemeIcon('symbol-package');
        } else if (element.dep.indirect) {
          item.iconPath = new vscode.ThemeIcon('package', new vscode.ThemeColor('disabledForeground'));
        } else {
          item.iconPath = new vscode.ThemeIcon('package');
        }
        
        item.tooltip = this.buildDepTooltip(element);
        if (!hasSource) {
          item.description = '(source not available)';
        }
        
        const contextSuffix = element.dep.version === 'stdlib' ? 'stdlib' 
          : element.dep.indirect ? 'indirect' : 'direct';
        item.contextValue = `dependency-${contextSuffix}`;
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
        return Array.from(this.projects.entries()).map(([root, deps]) => {
          const projectNode = this.getOrCreateNode(() => new ProjectNode(path.basename(root), root, deps));
          return projectNode as ProjectNode;
        });
      } else {
        // Single project: show categories directly
        const entry = Array.from(this.projects.entries())[0];
        if (!entry) { return []; }
        const [root, deps] = entry;
        const stdlibDeps = this.stdlibDeps.get(root) || [];
        return this.buildCategories(root, deps, stdlibDeps, undefined);
      }
    }

    if (element instanceof ProjectNode) {
      const stdlibDeps = this.stdlibDeps.get(element.projectRoot) || [];
      return this.buildCategories(element.projectRoot, element.dependencies, stdlibDeps, element);
    }

    if (element instanceof CategoryNode) {
      let filtered: DependencyInfo[];
      if (element.category === 'stdlib') {
        const stdlibDeps = this.stdlibDeps.get(element.projectRoot) || [];
        filtered = stdlibDeps;
      } else {
        filtered = element.dependencies.filter(d =>
          element.category === 'direct' ? !d.indirect : d.indirect
        );
      }
      
      return filtered
        .sort((a, b) => a.path.localeCompare(b.path))
        .map(dep => {
          const sourcePath = this.parser.getSourcePath(dep, element.projectRoot);
          const depNode = this.getOrCreateNode(() => new DependencyNode(dep, sourcePath, element));
          return depNode as DependencyNode;
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
  findNodeForFile(filePath: string, preferredProjectRoot?: string): { depNode?: DependencyNode; fileNode?: FileNode } | undefined {
    // 首先在 nodeMap 中查找已存在的文件节点（优先匹配 preferred project）
    if (preferredProjectRoot) {
      const preferredFileId = `file:${preferredProjectRoot}:${filePath}`;
      const cachedFile = this.nodeMap.get(preferredFileId) as FileNode | undefined;
      if (cachedFile) {
        const depId = `dep:${preferredProjectRoot}:${cachedFile.dep.path}@${cachedFile.dep.version}`;
        const depNode = this.nodeMap.get(depId) as DependencyNode | undefined;
        return { depNode, fileNode: cachedFile };
      }
      // preferred 没命中缓存时，直接走 candidates 构建，不 fallback 到其他项目的缓存
    } else {
      // 没有 preferred 时，遍历查找任意项目的缓存
      for (const [id, node] of this.nodeMap) {
        if (node instanceof FileNode && node.fsPath === filePath) {
          const depNode = this.findParentDep(node);
          return { depNode, fileNode: node };
        }
      }
    }

    // 如果文件节点未缓存，主动构建完整的节点链
    const candidates: { root: string; dep: DependencyInfo; sourcePath: string }[] = [];
    
    for (const [root, deps] of this.projects) {
      for (const dep of deps) {
        const sourcePath = this.parser.getSourcePath(dep, root);
        if (filePath.startsWith(sourcePath + path.sep) || filePath === sourcePath) {
          candidates.push({ root, dep, sourcePath });
        }
      }
    }

    // Also search stdlib deps
    for (const [root, stdlibDeps] of this.stdlibDeps) {
      for (const dep of stdlibDeps) {
        const sourcePath = dep.dir || '';
        if (sourcePath && (filePath.startsWith(sourcePath + path.sep) || filePath === sourcePath)) {
          candidates.push({ root, dep, sourcePath });
        }
      }
    }

    // 如果有多个匹配项且指定了首选项目根目录，优先返回匹配的项目
    if (candidates.length > 1 && preferredProjectRoot) {
      const preferred = candidates.find(c => c.root === preferredProjectRoot);
      if (preferred) {
        return this.buildNodeChain(preferred.root, preferred.dep, preferred.sourcePath, filePath);
      }
    }

    // 返回第一个匹配的候选项
    if (candidates.length > 0) {
      return this.buildNodeChain(candidates[0].root, candidates[0].dep, candidates[0].sourcePath, filePath);
    }
    
    return undefined;
  }

  private findParentDep(node: TreeNode): DependencyNode | undefined {
    let current: any = node;
    while (current) {
      if (current instanceof DependencyNode) { return current; }
      current = current.parent;
    }
    return undefined;
  }

  private buildNodeChain(root: string, dep: DependencyInfo, sourcePath: string, filePath?: string): { depNode: DependencyNode; fileNode?: FileNode } {
    const deps = this.projects.get(root) || [];
    
    // 主动创建完整的节点链：project -> category -> dependency
    const projectId = `project:${root}`;
    let projectNode = this.nodeMap.get(projectId) as ProjectNode | undefined;
    if (!projectNode) {
      projectNode = this.getOrCreateNode(() => new ProjectNode(path.basename(root), root, deps)) as ProjectNode;
    }

    const categoryId = `category:${root}:${dep.indirect ? 'indirect' : 'direct'}`;
    let categoryNode = this.nodeMap.get(categoryId) as CategoryNode | undefined;
    if (!categoryNode) {
      categoryNode = this.getOrCreateNode(() => new CategoryNode(
        dep.indirect ? 'Indirect Dependencies' : 'Direct Dependencies',
        dep.indirect ? 'indirect' : 'direct',
        root,
        deps,
        this.isWorkspace ? projectNode : undefined
      )) as CategoryNode;
    }

    // 创建依赖节点
    const depNode = this.getOrCreateNode(() => new DependencyNode(dep, sourcePath, categoryNode)) as DependencyNode;

    // 如果指定了文件路径，构建从 dep 到文件的完整目录链
    if (filePath && filePath.startsWith(sourcePath + path.sep)) {
      const relativePath = path.relative(sourcePath, filePath);
      const segments = relativePath.split(path.sep);
      let currentPath = sourcePath;
      let parentNode: TreeNode = depNode;

      // 逐级创建目录节点
      for (let i = 0; i < segments.length - 1; i++) {
        currentPath = path.join(currentPath, segments[i]);
        const dirNode = this.getOrCreateNode(() => new DirectoryNode(segments[i], currentPath, dep, parentNode));
        parentNode = dirNode;
      }

      // 创建文件节点
      const fileName = segments[segments.length - 1];
      const fullFilePath = path.join(currentPath, fileName);
      const fileNode = this.getOrCreateNode(() => new FileNode(fileName, fullFilePath, dep, parentNode));
      return { depNode, fileNode };
    }

    return { depNode };
  }

  /** 获取或创建节点，确保每个 id 只有一个实例 */
  private getOrCreateNode<T extends TreeNode>(factory: () => T): T {
    const node = factory();
    const existing = this.nodeMap.get(node.id);
    if (existing) {
      return existing as T;
    }
    this.nodeMap.set(node.id, node);
    return node;
  }

  private buildCategories(
    projectRoot: string,
    deps: DependencyInfo[],
    stdlibDeps: DependencyInfo[],
    parent: ProjectNode | undefined,
  ): TreeNode[] {
    const categories: TreeNode[] = [];
    const directDeps = deps.filter(d => !d.indirect);
    const indirectDeps = deps.filter(d => d.indirect);

    if (directDeps.length > 0) {
      const categoryNode = this.getOrCreateNode(() => new CategoryNode('Direct Dependencies', 'direct', projectRoot, deps, parent));
      categories.push(categoryNode);
    }
    if (this.config.showIndirect && indirectDeps.length > 0) {
      const categoryNode = this.getOrCreateNode(() => new CategoryNode('Indirect Dependencies', 'indirect', projectRoot, deps, parent));
      categories.push(categoryNode);
    }
    if (stdlibDeps.length > 0) {
      const categoryNode = this.getOrCreateNode(() => new CategoryNode('Standard Library', 'stdlib', projectRoot, stdlibDeps, parent));
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
          // 使用统一的节点管理
          const dirNode = this.getOrCreateNode(() => new DirectoryNode(entry.name, fullPath, dep, parent));
          dirs.push(dirNode as DirectoryNode);
        } else {
          // 使用统一的节点管理
          const fileNode = this.getOrCreateNode(() => new FileNode(entry.name, fullPath, dep, parent));
          files.push(fileNode as FileNode);
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
      `Version: \`${dep.version}\`  `,
      `Type: ${dep.indirect ? 'Indirect' : 'Direct'}  `,
      `Path: \`${node.sourcePath}\`  `,
    ];
    if (dep.replace) {
      lines.push(``);
      lines.push(`**Replace:**  `);
      lines.push(`→ ${dep.replace.path}${dep.replace.version ? '@' + dep.replace.version : ''}  `);
      if (dep.replace.dir) { lines.push(`Path: \`${dep.replace.dir}\`  `); }
    }
    if (dep.goVersion) {
      lines.push(`Go Version: \`${dep.goVersion}\`  `);
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
