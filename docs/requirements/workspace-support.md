# 工作空间支持

## 修订记录

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2026-03-20 | PM | 初始版本 |

## 1. 功能描述

支持单项目和多项目工作空间（包括 mono-repo），多项目时按项目分组显示依赖树。

## 2. 用户场景

**作为** 在 VSCode 中打开多个 Go 项目的开发者，**我希望** 依赖树按项目分组展示，**以便** 清晰区分每个项目的依赖。

## 3. 功能清单

| ID | 功能 | 优先级 |
|----|------|--------|
| F3.1 | 单项目模式：直接显示分类节点（不显示项目节点） | P0 |
| F3.2 | 多项目模式：顶层为项目节点，每个项目下显示分类和依赖 | P0 |
| F3.3 | 项目节点使用 .code-workspace 中定义的 folder name 显示 | P0 |
| F3.4 | 项目顺序与 workspace folders 定义顺序一致 | P0 |
| F3.5 | 同一依赖在不同项目中作为独立节点，不跨项目混淆 | P0 |
| F3.6 | Mono-repo 支持：自动扫描 workspace folder 下一级子目录中的 go.mod | P0 |
| F3.7 | 项目按根路径去重 | P0 |

## 4. 树结构示例

### 单项目
```
Direct Dependencies (5)
├── github.com/gin-gonic/gin@v1.9.1
└── ...
Indirect Dependencies (12)
└── ...
Standard Library (8)
└── ...
```

### 多项目
```
project1/
├── Direct Dependencies (5)
├── Indirect Dependencies (12)
└── Standard Library (8)
project2/
├── Direct Dependencies (3)
└── ...
```

## 5. 输入/输出

### 输入
- `vscode.workspace.workspaceFolders` — 工作区文件夹列表
- 每个文件夹及其一级子目录下的 go.mod 文件

### 输出
- 根据项目数量决定树结构层级

## 6. 约束条件

- 判断多项目模式的条件：发现的 Go 项目数 > 1
- Mono-repo 子目录扫描仅扫一级，跳过以 `.` 开头的目录
- 扫描出错时静默忽略该目录
