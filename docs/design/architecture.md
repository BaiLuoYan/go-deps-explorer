# VSCode Go Dependencies Explorer - 系统架构

## 修订记录
| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0  | 2026-03-20 | DEV | 基于v0.2.5源码重构架构文档 |

## 1. 技术概述

### 1.1 技术栈选型

| 技术组件 | 选型 | 版本要求 | 说明 |
|---------|------|----------|------|
| **运行时** | VSCode Extension Host | ≥1.75.0 | 扩展宿主环境 |
| **语言** | TypeScript | ^5.3.0 | 类型安全的JavaScript超集 |
| **构建** | VSCode Extension API | ^1.75.0 | 官方扩展开发API |
| **工具链** | go list, go env | ≥1.18 | Go模块依赖解析 |
| **打包** | vsce | ^2.22.0 | 官方扩展打包工具 |

### 1.2 系统架构图

```
┌─────────────────────────────────────────────────┐
│                VSCode Extension                 │
│                                                 │
│  ┌──────────┐   ┌──────────────────────────┐    │
│  │Extension │──▶│  DependencyTreeProvider  │    │
│  │Entry     │   │  (TreeDataProvider impl) │    │
│  └──────────┘   └──────────┬───────────────┘    │
│       │                    │                     │
│       ▼                    ▼                     │
│  ┌──────────┐   ┌──────────────────────────┐    │
│  │GoMod     │   │  TreeNode 数据模型       │    │
│  │Watcher   │   │  - ProjectNode           │    │
│  └──────────┘   │  - CategoryNode          │    │
│       │         │  - DependencyNode        │    │
│       ▼         │  - DirectoryNode         │    │
│  ┌──────────┐   │  - FileNode              │    │
│  │GoMod     │   └──────────────────────────┘    │
│  │Parser    │                                    │
│  └──────────┘   ┌──────────────────────────┐    │
│                 │  EditorTracker           │    │
│  ┌──────────┐   │  (跳转定位)              │    │
│  │Config    │   └──────────────────────────┘    │
│  │Manager   │                                    │
│  └──────────┘   ┌──────────────────────────┐    │
│                 │  ReadonlyFileViewer      │    │
│                 │  (只读文件查看)          │    │
│                 └──────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### 1.3 技术约束与依赖

#### 运行环境约束
- **VSCode版本**：≥1.75.0（2023年1月发布）
- **Node.js**：Extension Host内置，无需额外安装
- **Go工具链**：要求工作区安装Go（≥1.18），用于执行`go list`、`go env`

#### 外部依赖
- **无运行时依赖**：全部使用VSCode内置API和Node.js标准库
- **开发依赖**：TypeScript编译器、ESLint、vsce打包工具

## 2. 核心组件架构

### 2.1 Extension Entry（扩展入口）
- **文件**：`extension.ts`
- **职责**：扩展生命周期管理、组件初始化、命令注册
- **激活条件**：`workspaceContains:**/go.mod`

### 2.2 DependencyTreeProvider（树数据提供器）
- **文件**：`dependencyTreeProvider.ts`
- **职责**：实现`vscode.TreeDataProvider<TreeNode>`接口，驱动侧边栏依赖树
- **核心功能**：节点管理、懒加载、工作区模式、Lazy Mode

### 2.3 GoModParser（模块解析器）
- **文件**：`goModParser.ts`
- **职责**：解析Go项目依赖信息，支持直接依赖、间接依赖、标准库依赖
- **命令依赖**：`go list -m -json all`、`go list -json ./...`、`go env GOROOT`

### 2.4 EditorTracker（编辑器追踪器）
- **文件**：`editorTracker.ts` 
- **职责**：监听编辑器切换，Cmd+Click跳转到依赖源码时自动定位依赖树
- **核心功能**：依赖文件识别、树节点定位、Lazy Mode触发

### 2.5 TreeNode数据模型
- **文件**：`models.ts`
- **职责**：定义依赖树的数据结构
- **节点类型**：Project、Category、Dependency、Directory、File

### 2.6 配套组件
- **ConfigManager**：扩展配置管理
- **ReadonlyFileViewer**：只读文件查看器
- **GoModWatcher**：go.mod文件变更监听器

## 3. 数据流架构

### 3.1 初始化流程
```
VSCode检测go.mod → activate() → findGoProjects() → GoModParser解析依赖 
→ DependencyTreeProvider初始化 → 注册TreeView → 启动监听器
```

### 3.2 用户交互流程
```
用户点击树节点 → getChildren() → 懒加载目录结构 → 返回子节点
用户点击文件 → openFile命令 → ReadonlyFileViewer → 只读打开文件
```

### 3.3 跳转定位流程
```
Cmd+Click跳转 → onDidChangeActiveTextEditor → EditorTracker判断依赖文件 
→ findNodeForFile() → reveal()定位 → Lazy Mode添加依赖（可选）
```

## 4. 扩展性设计

### 4.1 模块化架构
- **职责分离**：每个组件单一职责，低耦合高内聚
- **事件驱动**：使用VSCode事件系统，支持响应式更新
- **配置驱动**：通过ConfigManager支持用户自定义行为

### 4.2 多项目支持
- **工作区检测**：自动识别单项目模式vs工作区模式
- **项目隔离**：不同项目的依赖数据独立管理
- **统一界面**：工作区模式下按项目分组展示

### 4.3 性能优化
- **懒加载**：目录结构按需展开，避免大量文件系统I/O
- **节点缓存**：统一节点管理器确保对象唯一性
- **事件防抖**：go.mod变更监听采用防抖机制

## 5. 技术特色

### 5.1 Lazy Mode（懒加载模式）
- **v0.2.0引入**：初始依赖树为空，仅在跳转时显示依赖包
- **持久化**：已访问的依赖包记录在`workspaceState`
- **渐进式体验**：随着开发过程逐步构建完整依赖树

### 5.2 智能文件识别
- **路径识别**：`$GOPATH/pkg/mod`、`vendor/`、`$GOROOT/src`
- **模块解析**：从文件路径反向解析模块名和版本
- **标准库支持**：动态识别和添加标准库包

### 5.3 无缝跳转体验
- **原生文件URI**：v0.1.20移除自定义scheme，支持gopls语言服务
- **自动只读**：依赖源码自动标记只读状态
- **精确定位**：跳转后自动展开到具体文件节点