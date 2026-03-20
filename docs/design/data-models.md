# 数据模型设计

## 修订记录
| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0  | 2026-03-20 | DEV | 基于v0.2.5源码重构数据模型文档 |

## 1. 数据模型概述

### 1.1 模型职责
数据模型层负责定义依赖树的数据结构，为TreeDataProvider提供强类型约束。采用面向对象设计，每个节点类型都有明确的职责和属性。

### 1.2 模型层级关系
```
TreeNode (联合类型)
├── ProjectNode        # 项目节点（工作区模式）
├── CategoryNode       # 分类节点（直接依赖/间接依赖/标准库）
├── DependencyNode     # 依赖包节点
├── DirectoryNode      # 目录节点  
└── FileNode          # 文件节点
```

## 2. 核心数据结构

### 2.1 DependencyInfo（依赖信息接口）

```typescript
interface DependencyInfo {
  path: string;          // 模块路径，如 "github.com/gin-gonic/gin"
  version: string;       // 版本号，如 "v1.9.1" 或 "stdlib"
  indirect: boolean;     // 是否间接依赖
  dir?: string;          // 本地源码路径（go list 返回）
  goVersion?: string;    // Go 版本要求
  replace?: {            // replace 信息
    path: string;
    version?: string;
    dir?: string;
  };
}
```

**字段说明**：
- `path`：模块导入路径，唯一标识一个Go模块
- `version`：语义化版本号，标准库使用特殊值`"stdlib"`
- `indirect`：标记是否为间接依赖（在go.mod中有`// indirect`注释）
- `dir`：本地源码的文件系统路径，由`go list`命令返回
- `replace`：go.mod中replace指令的信息，支持本地替换和版本替换

### 2.2 NodeType（节点类型枚举）

```typescript
enum NodeType {
  Project = 'project',      // 项目根节点
  Category = 'category',    // 分类节点
  Dependency = 'dependency', // 依赖包节点
  Directory = 'directory',  // 目录节点
  File = 'file',           // 文件节点
}
```

## 3. 树节点模型

### 3.1 ProjectNode（项目节点）

```typescript
class ProjectNode {
  readonly type = NodeType.Project;
  readonly id: string;
  constructor(
    public readonly label: string,        // 显示名称
    public readonly projectRoot: string,  // 项目根目录绝对路径
    public dependencies: DependencyInfo[] // 项目依赖列表
  ) {
    this.id = `project:${projectRoot}`;
  }
}
```

**使用场景**：工作区模式下作为根节点，区分不同的Go项目
**ID规则**：`project:{项目根目录路径}`

### 3.2 CategoryNode（分类节点）

```typescript
class CategoryNode {
  readonly type = NodeType.Category;
  readonly id: string;
  constructor(
    public readonly label: string,                    // 显示标签
    public readonly category: 'direct' | 'indirect' | 'stdlib', // 分类类型
    public readonly projectRoot: string,              // 所属项目根目录
    public readonly dependencies: DependencyInfo[],   // 分类下的依赖列表
    public readonly parent: ProjectNode | undefined   // 父节点
  ) {
    this.id = `category:${projectRoot}:${category}`;
  }
}
```

**分类类型**：
- `direct`：直接依赖（在go.mod中直接声明）
- `indirect`：间接依赖（传递依赖，标记为`// indirect`）
- `stdlib`：标准库依赖（Go内置包）

**ID规则**：`category:{项目根目录}:{分类类型}`

### 3.3 DependencyNode（依赖包节点）

```typescript
class DependencyNode {
  readonly type = NodeType.Dependency;
  readonly id: string;
  constructor(
    public readonly dep: DependencyInfo,      // 依赖信息
    public readonly sourcePath: string,      // 源码路径
    public readonly parent: CategoryNode     // 父分类节点
  ) {
    this.id = `dep:${parent.projectRoot}:${dep.path}@${dep.version}`;
  }

  get label(): string {
    return `${this.dep.path}@${this.dep.version}`;
  }
}
```

**关键属性**：
- `dep`：包含完整的依赖元信息
- `sourcePath`：实际的源码文件系统路径，经过replace处理和vendor优先级计算
- `label`：树中显示的标签，格式为`{路径}@{版本}`

**ID规则**：`dep:{项目根目录}:{模块路径}@{版本}`，确保多项目工作区下的唯一性

### 3.4 DirectoryNode（目录节点）

```typescript
class DirectoryNode {
  readonly type = NodeType.Directory;
  readonly id: string;
  constructor(
    public readonly label: string,        // 目录名
    public readonly fsPath: string,       // 目录绝对路径
    public readonly dep: DependencyInfo,  // 所属依赖
    public readonly parent: TreeNode,     // 父节点
    projectRoot?: string                  // 项目根目录（可选）
  ) {
    const root = projectRoot || this.resolveProjectRoot();
    this.id = `dir:${root}:${fsPath}`;
  }
}
```

**路径解析**：通过父节点链向上遍历找到项目根目录，确保ID唯一性

### 3.5 FileNode（文件节点）

```typescript
class FileNode {
  readonly type = NodeType.File;
  readonly id: string;
  constructor(
    public readonly label: string,        // 文件名
    public readonly fsPath: string,       // 文件绝对路径
    public readonly dep: DependencyInfo,  // 所属依赖
    public readonly parent: TreeNode,     // 父节点
    projectRoot?: string                  // 项目根目录（可选）
  ) {
    const root = projectRoot || this.resolveProjectRoot();
    this.id = `file:${root}:${fsPath}`;
  }
}
```

**叶子节点**：树结构的终端节点，不包含子节点

### 3.6 TreeNode（联合类型）

```typescript
type TreeNode = ProjectNode | CategoryNode | DependencyNode | DirectoryNode | FileNode;
```

VSCode TreeDataProvider的泛型参数，支持类型安全的树操作。

## 4. 辅助数据结构

### 4.1 StdlibInfo（标准库信息）

```typescript
interface StdlibInfo {
  name: string;  // 标准库包名，如 "fmt", "net/http"
  dir: string;   // 源码目录，位于 $GOROOT/src 下
}
```

**用途**：标准库依赖的元信息，从`go list -json ./...`解析得到

### 4.2 项目信息结构

```typescript
// 用于扩展初始化的项目信息
interface ProjectInfo {
  root: string;  // 项目根目录绝对路径
  name: string;  // 项目显示名称（来自VSCode workspace folder）
}
```

## 5. 数据流转

### 5.1 初始化数据流

```
findGoProjects() → ProjectInfo[]
    ↓
GoModParser.parseDependencies() → DependencyInfo[]
    ↓
DependencyTreeProvider.initialize() → 构建内部数据结构
    ↓
getChildren() → TreeNode[] （按需构建节点实例）
```

### 5.2 节点ID设计原则

**唯一性保证**：所有节点ID都包含项目根目录前缀，避免多项目工作区下的冲突

**格式规范**：
- Project: `project:{projectRoot}`
- Category: `category:{projectRoot}:{categoryType}`  
- Dependency: `dep:{projectRoot}:{path}@{version}`
- Directory: `dir:{projectRoot}:{fsPath}`
- File: `file:{projectRoot}:{fsPath}`

### 5.3 节点缓存机制

```typescript
private nodeMap = new Map<string, TreeNode>();

private getOrCreateNode<T extends TreeNode>(factory: () => T): T {
  const node = factory();
  const existing = this.nodeMap.get(node.id);
  if (existing) { return existing as T; }
  this.nodeMap.set(node.id, node);
  return node;
}
```

**缓存优势**：
- 确保节点实例唯一性，避免重复创建
- 支持精确的树节点定位（reveal功能）
- 提升内存使用效率

## 6. 扩展性设计

### 6.1 新节点类型扩展
通过扩展`NodeType`枚举和`TreeNode`联合类型，可以轻松添加新的节点类型。

### 6.2 依赖信息扩展
`DependencyInfo`接口采用可选字段设计，支持未来添加新的依赖元信息。

### 6.3 类型安全保证
全面使用TypeScript类型系统，确保编译时捕获数据结构错误。