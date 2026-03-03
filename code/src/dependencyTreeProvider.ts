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
          return new DependencyNode(dep, sourcePath, element);
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

  /** Find and return the FileNode for a given absolute file path */
  findNodeForFile(filePath: string): { depNode: DependencyNode; relativePath: string } | undefined {
    for (const [root, deps] of this.projects) {
      for (const dep of deps) {
        const sourcePath = this.parser.getSourcePath(dep, root);
        if (filePath.startsWith(sourcePath + path.sep) || filePath === sourcePath) {
          const relativePath = path.relative(sourcePath, filePath);
          // Build a temporary DependencyNode for reveal
          const category = dep.indirect ? 'indirect' : 'direct';
          const catNode = new CategoryNode(
            category === 'direct' ? '直接依赖' : '间接依赖',
            category, root, deps, undefined,
          );
          const depNode = new DependencyNode(dep, sourcePath, catNode);
          return { depNode, relativePath };
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
      categories.push(new CategoryNode('直接依赖', 'direct', projectRoot, deps, parent));
    }
    if (this.config.showIndirect && indirectDeps.length > 0) {
      categories.push(new CategoryNode('间接依赖', 'indirect', projectRoot, deps, parent));
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
          dirs.push(new DirectoryNode(entry.name, fullPath, dep, parent));
        } else {
          files.push(new FileNode(entry.name, fullPath, dep, parent));
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
