# Go Dependencies Explorer — 需求文档

**文档版本**: v1.0  
**日期**: 2026-03-03  
**状态**: 待项目经理审核

---

## 1. 项目概述

开发一个 VSCode 扩展（TypeScript），用于在侧边栏 Explorer 面板下方显示当前 Go 项目的所有依赖包，支持浏览依赖包源码、跳转定位等功能。

## 2. 功能需求

### 2.1 依赖树展示 [P0 - 必须]

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| F1 | 在 Explorer 面板下方新增「Go Dependencies」面板，显示当前 Go 项目的所有依赖 | P0 |
| F1.1 | 依赖来源为 `go.mod` + `go.sum`，通过 `go list -m -json all` 或解析 go.mod 获取 | P0 |
| F1.2 | 同时显示**直接依赖**和**间接依赖**（传递依赖） | P0 |
| F1.3 | 分类标签使用英文：**Direct Dependencies** / **Indirect Dependencies** | P0 |
| F1.4 | 每个依赖包根节点显示格式：`包名@版本号`（如 `github.com/gin-gonic/gin@v1.9.1`） | P0 |
| F1.5 | 鼠标 hover 依赖包根节点时，显示详细信息 tooltip（英文标签，支持正确换行） | P0 |
| F1.6 | 源码不可用的依赖显示 `(source not available)` 且不可展开 | P0 |

### 2.2 依赖包目录浏览 [P0 - 必须]

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| F2 | 点击依赖包可展开其完整目录结构（懒加载） | P0 |
| F2.1 | 依赖包源码路径：优先检查项目 `vendor/` 目录，不存在则从 `$GOPATH/pkg/mod/` 读取 | P0 |
| F2.2 | 点击目录中的文件时，以**只读方式**在编辑器中打开文件内容 | P0 |
| F2.3 | go.mod 解析失败时，使用 fallback 解析器支持多 require 块和单行 require | P0 |
| F2.4 | 通过 Output Channel "Go Deps Explorer" 提供诊断日志 | P0 |

### 2.3 工作空间支持 [P0 - 必须]

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| F3 | 单项目模式：直接显示依赖列表 | P0 |
| F3.1 | 工作空间（多项目）模式：按项目分组显示依赖树 | P0 |
| F3.2 | 工作空间模式下的树结构示例：| P0 |

```
project1/
├── [直接依赖]
│   ├── github.com/gin-gonic/gin@v1.9.1
│   └── github.com/go-redis/redis@v8.11.5
└── [间接依赖]
    ├── github.com/json-iterator/go@v1.1.12
    └── golang.org/x/sys@v0.15.0
project2/
├── [直接依赖]
│   └── ...
└── [间接依赖]
    └── ...
```

### 2.4 跳转定位 [P0 - 必须]

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| F4 | 用户按住 Cmd（Mac）/ Ctrl（Win/Linux）点击代码跳转到依赖包文件时，自动在依赖树中**定位到该文件所在的依赖包** | P0 |
| F4.1 | **精确路径展开**：只展开到目标文件路径，不展开所有目录 | P0 |
| F4.2 | 高亮/选中目标文件节点 | P0 |
| F4.3 | **多项目工作空间**：正确定位到用户跳转来源的项目（记住 lastProjectRoot） | P0 |

### 2.5 自动刷新 [P0 - 必须]

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| F5 | 监听 `go.mod` 文件变化，自动刷新依赖树 | P0 |
| F5.1 | 同时提供手动刷新按钮（面板标题栏） | P0 |

### 2.6 Replace 指令处理 [P1 - 重要]

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| F6 | `go.mod` 中的 `replace` 指令：通过插件设置控制是否处理 | P1 |
| F6.1 | 设置项：`goDepsExplorer.handleReplace`（默认 `true`） | P1 |
| F6.2 | 开启时：replace 目标路径覆盖原始依赖路径；关闭时：忽略 replace，显示原始依赖 | P1 |
| F6.3 | replace 到本地路径的依赖，tooltip 中显示本地路径信息 | P1 |

## 3. 非功能需求

| ID | 描述 |
|----|------|
| NF1 | 使用 TypeScript 开发 |
| NF2 | 支持 VSCode 最低版本：1.75.0+ |
| NF3 | 依赖树加载采用懒加载，避免大量依赖时卡顿 |
| NF4 | 扩展激活条件：工作区包含 `go.mod` 文件时自动激活 |
| NF5 | 支持 Mac / Windows / Linux |
| NF6 | 发布到 VSCode 插件市场 |

## 4. 技术约束

- 依赖信息获取：优先使用 `go list -m -json all` 命令（需要用户环境安装 Go）
- 源码路径：`vendor/` 优先，fallback 到 `$GOPATH/pkg/mod/`
- 只读打开文件：使用 VSCode 的 `vscode.workspace.openTextDocument` + `showTextDocument` 并设置只读
- 文件监听：使用 `vscode.workspace.createFileSystemWatcher` 监听 `**/go.mod`

## 5. 插件配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `goDepsExplorer.handleReplace` | boolean | true | 是否处理 go.mod 中的 replace 指令 |
| `goDepsExplorer.showIndirect` | boolean | true | 是否显示间接依赖 |
| `goDepsExplorer.vendorFirst` | boolean | false | 优先使用 vendor 目录 |

## 7. 版本发布需求

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| F8 | 每个版本需要创建 git tag (annotated tag) | P1 |
| F8.1 | 每个版本需要创建对应的 GitHub Release | P1 |
| F8.2 | 所有用户可见文本（界面、提示、错误信息）统一使用英文 | P0 |

## 8. 验收标准

1. ✅ 打开包含 go.mod 的项目，侧边栏自动显示依赖树
2. ✅ 直接依赖和间接依赖有明确视觉区分
3. ✅ 每个依赖显示名称+版本，hover 显示详情
4. ✅ 点击依赖可展开目录，点击文件以只读方式打开
5. ✅ 工作空间模式下按项目分组显示
6. ✅ Cmd+Click 跳转到依赖代码时，依赖树自动定位展开
7. ✅ 修改 go.mod 后依赖树自动刷新
8. ✅ replace 指令可通过设置控制
