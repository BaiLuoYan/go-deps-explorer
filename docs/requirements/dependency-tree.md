# 依赖树展示

## 修订记录

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2026-03-20 | PM | 初始版本 |

## 1. 功能描述

在 VSCode Explorer 面板下方新增「Go Dependencies」视图，以树形结构展示当前 Go 项目的所有依赖包，按直接依赖、间接依赖、标准库三个分类组织。

## 2. 用户场景

**作为** Go 开发者，**我希望** 在 VSCode 侧边栏直接看到项目的所有依赖及其分类，**以便** 快速了解项目依赖全貌。

## 3. 功能清单

| ID | 功能 | 优先级 |
|----|------|--------|
| F1.1 | 在 Explorer 面板下方显示「Go Dependencies」视图 | P0 |
| F1.2 | 依赖数据通过 `go list -m -json all` 获取，fallback 解析 go.mod 文件 | P0 |
| F1.3 | 分三个分类节点：Direct Dependencies / Indirect Dependencies / Standard Library | P0 |
| F1.4 | 分类节点显示依赖数量，如 `Direct Dependencies (12)` | P0 |
| F1.5 | 依赖包节点显示格式：`包名@版本号`（如 `github.com/gin-gonic/gin@v1.9.1`） | P0 |
| F1.6 | 鼠标 hover 依赖包节点显示 Markdown tooltip：包名、版本、类型、源码路径、GitHub/GitLab 链接 | P0 |
| F1.7 | 源码不可用的依赖显示 `(source not available)` 且不可展开 | P0 |
| F1.8 | 所有 Project 和 Category 节点默认折叠（Collapsed） | P0 |
| F1.9 | 依赖按路径字母排序 | P0 |
| F1.10 | showIndirect=false 时隐藏 Indirect Dependencies 分类 | P0 |

## 4. 输入/输出

### 输入
- `go list -m -json all` 命令输出（JSON 流）
- go.mod 文件内容（fallback）

### 输出
- 树形视图：Project → Category → Dependency → Directory → File

## 5. 数据获取

### 主路径：go list
```
go list -m -json all → 解析 JSON 流 → 过滤 Main 模块 → 构建 DependencyInfo[]
```
字段映射：Path → path, Version → version, Indirect → indirect, Dir → dir, GoVersion → goVersion, Replace → replace

### Fallback：go.mod 解析
当 `go list` 失败时，直接解析 go.mod 文件：
- 支持 `require ( ... )` 块语法
- 支持 `require pkg version` 单行语法
- 通过 `// indirect` 注释判断间接依赖

## 6. 图标规则

| 节点类型 | 图标 |
|----------|------|
| Project | `root-folder` |
| Direct Dependencies | `folder-library` |
| Indirect Dependencies | `folder` |
| Standard Library | `symbol-package` |
| 直接依赖包 | `package` |
| 间接依赖包 | `package`（disabledForeground 颜色） |
| 标准库包 | `symbol-package` |
| Replace 依赖 | `arrow-swap` |

## 7. 约束条件

- 需要用户环境安装 Go 工具链
- go list 最大输出缓冲区：10MB
- JSON 流解析需处理多个独立 JSON 对象拼接的格式
- 隐藏以 `.` 开头的文件和目录
