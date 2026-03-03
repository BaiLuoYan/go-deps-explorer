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
  constructor(
    public readonly label: string,
    public readonly projectRoot: string,
    public dependencies: DependencyInfo[],
  ) {}
}

export class CategoryNode {
  readonly type = NodeType.Category;
  constructor(
    public readonly label: string,
    public readonly category: 'direct' | 'indirect',
    public readonly projectRoot: string,
    public readonly dependencies: DependencyInfo[],
    public readonly parent: ProjectNode | undefined,
  ) {}
}

export class DependencyNode {
  readonly type = NodeType.Dependency;
  constructor(
    public readonly dep: DependencyInfo,
    public readonly sourcePath: string,
    public readonly parent: CategoryNode,
  ) {}

  get label(): string {
    return `${this.dep.path}@${this.dep.version}`;
  }
}

export class DirectoryNode {
  readonly type = NodeType.Directory;
  constructor(
    public readonly label: string,
    public readonly fsPath: string,
    public readonly dep: DependencyInfo,
    public readonly parent: TreeNode,
  ) {}
}

export class FileNode {
  readonly type = NodeType.File;
  constructor(
    public readonly label: string,
    public readonly fsPath: string,
    public readonly dep: DependencyInfo,
    public readonly parent: TreeNode,
  ) {}
}

export type TreeNode = ProjectNode | CategoryNode | DependencyNode | DirectoryNode | FileNode;
