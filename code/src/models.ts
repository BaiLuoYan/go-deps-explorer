// ==================== 数据模型 ====================

export enum NodeType {
  Project = 'project',
  Category = 'category',
  Dependency = 'dependency',
  Directory = 'directory',
  File = 'file',
}

export interface DependencyInfo {
  path: string;
  version: string;
  indirect: boolean;
  dir?: string;
  goVersion?: string;
  replace?: {
    path: string;
    version?: string;
    dir?: string;
  };
}

export class ProjectNode {
  readonly type = NodeType.Project;
  readonly id: string;
  constructor(
    public readonly label: string,
    public readonly projectRoot: string,
    public dependencies: DependencyInfo[],
  ) {
    this.id = `project:${projectRoot}`;
  }
}

export class CategoryNode {
  readonly type = NodeType.Category;
  readonly id: string;
  constructor(
    public readonly label: string,
    public readonly category: 'direct' | 'indirect',
    public readonly projectRoot: string,
    public readonly dependencies: DependencyInfo[],
    public readonly parent: ProjectNode | undefined,
  ) {
    this.id = `category:${projectRoot}:${category}`;
  }
}

export class DependencyNode {
  readonly type = NodeType.Dependency;
  readonly id: string;
  constructor(
    public readonly dep: DependencyInfo,
    public readonly sourcePath: string,
    public readonly parent: CategoryNode,
  ) {
    this.id = `dep:${dep.path}@${dep.version}`;
  }

  get label(): string {
    return `${this.dep.path}@${this.dep.version}`;
  }
}

export class DirectoryNode {
  readonly type = NodeType.Directory;
  readonly id: string;
  constructor(
    public readonly label: string,
    public readonly fsPath: string,
    public readonly dep: DependencyInfo,
    public readonly parent: TreeNode,
  ) {
    this.id = `dir:${fsPath}`;
  }
}

export class FileNode {
  readonly type = NodeType.File;
  readonly id: string;
  constructor(
    public readonly label: string,
    public readonly fsPath: string,
    public readonly dep: DependencyInfo,
    public readonly parent: TreeNode,
  ) {
    this.id = `file:${fsPath}`;
  }
}

export type TreeNode = ProjectNode | CategoryNode | DependencyNode | DirectoryNode | FileNode;
