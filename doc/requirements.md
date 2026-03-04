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
| F3.2 | 多项目工作空间下，同一依赖包在不同项目中必须作为独立节点管理，确保展开定位时不会跨项目混淆 | P0 |
| F3.3 | 工作空间模式下，项目节点按 .code-workspace 文件中定义的名称和顺序显示，而不是使用目录 basename | P0 |
| F3.4 | 工作空间模式下的树结构示例：| P0 |

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

### 2.4 Go 标准库包展示 [P1 - 重要]

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| F4 | 依赖树新增 "Standard Library" 分类节点，显示项目中 import 的所有 Go 标准库包（需收集所有来源的标准库包：直接导入、测试导入、传递依赖） | P1 |
| F4.1 | 通过 `go list -json ./...` 获取项目 import 列表，过滤出标准库包（如 fmt, net/http, os 等），确保收集 Imports、TestImports、XTestImports、Deps 四个字段中的所有标准库包 | P1 |
| F4.2 | 标准库包可以展开浏览目录结构（源码在 $GOROOT/src/ 下） | P1 |
| F4.3 | 标准库包使用区别于普通依赖的图标（如 built-in 图标） | P1 |
| F4.4 | Cmd+Click 跳转到标准库代码时，自动定位到依赖树中的对应包 | P0 |

### 2.5 跳转定位 [P0 - 必须]

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| F5 | 用户按住 Cmd（Mac）/ Ctrl（Win/Linux）点击代码跳转到依赖包文件时，自动在依赖树中**定位到该文件所在的依赖包** | P0 |
| F5.1 | **精确路径展开**：只展开到目标文件路径，不展开所有目录 | P0 |
| F5.2 | 高亮/选中目标文件节点 | P0 |
| F5.3 | **多项目工作空间**：正确定位到用户跳转来源的项目（记住 lastProjectRoot） | P0 |

### 2.6 自动刷新 [P0 - 必须]

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| F6 | 监听 `go.mod` 文件变化，自动刷新依赖树 | P0 |
| F6.1 | 同时提供手动刷新按钮（面板标题栏） | P0 |

### 2.7 Replace 依赖特殊图标 [P1 - 重要]

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| F7 | 在 go.mod 中有 replace 指令的依赖包，在依赖树中使用特殊图标标识 | P1 |
| F7.1 | 使用 VSCode 内置的 find-replace 或 arrow-swap 图标区分 replace 依赖 | P1 |
| F7.2 | 在依赖包名称旁显示 "→ replaced" 描述 | P1 |
| F7.3 | Hover tooltip 显示详细的替换信息（原路径 → 替换路径） | P1 |

### 2.8 Replace 指令处理 [P1 - 重要]

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| F8 | `go.mod` 中的 `replace` 指令：通过插件设置控制是否处理 | P1 |
| F8.1 | 设置项：`goDepsExplorer.handleReplace`（默认 `true`） | P1 |
| F8.2 | 开启时：replace 目标路径覆盖原始依赖路径；关闭时：忽略 replace，显示原始依赖 | P1 |
| F8.3 | replace 到本地路径的依赖，tooltip 中显示本地路径信息 | P1 |

### 2.9 依赖源码内跳转支持 [P0 - 必须]

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| F9 | 在依赖包源码中能够 Cmd+Click 跳转到其他依赖包或标准库 | P0 |
| F9.1 | 依赖源码文件使用原生 `file://` URI 方式打开，而非自定义 scheme | P0 |
| F9.2 | gopls 语言服务器能正常索引和解析依赖包源码文件 | P0 |
| F9.3 | 在依赖包源码中跳转到其他依赖时，能自动在依赖树中定位目标依赖包 | P0 |

### 2.10 懒加载模式 [P1 - 重要]

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| F10 | 新增配置 `goDepsExplorer.lazyMode`（boolean, 默认 false）控制懒加载模式 | P1 |
| F10.1 | **初始状态**：开启 lazyMode 时，初始依赖树为空，不显示任何依赖包 | P1 |
| F10.2 | **自动显示**：当 Cmd+Click 跳转到依赖源码时，该依赖包自动出现在依赖树中并展开到对应文件 | P1 |
| F10.3 | **累积保留**：之前已展示过的依赖包保留显示，不会在后续操作中消失 | P1 |
| F10.4 | **持久化存储**：插件/VSCode 重启时，之前打开过的依赖包自动恢复显示 | P1 |
| F10.5 | **兼容性**：lazyMode=false 时，行为与之前版本完全一致，显示所有依赖包 | P1 |
| F10.6 | **分类过滤**：lazy mode 下隐藏没有已展示依赖的 category（直接依赖/间接依赖/标准库） | P1 |
| F10.7 | **项目过滤**：workspace mode 下隐藏没有已展示依赖的 project | P1 |

### 2.11 默认折叠行为 [P0 - 必须]

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| F11 | 所有 Project 节点和 Category 节点默认折叠状态（Collapsed） | P0 |
| F11.1 | 无论 lazyMode 是否开启，所有树节点的初始状态均为 Collapsed（不再是 Expanded） | P0 |

### 2.12 自动 Reveal [P0 - 必须]

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| F12 | 启动时检查当前 active editor，如果是依赖文件则自动 reveal 并定位 | P0 |
| F12.1 | 启动延迟检查（setTimeout 1s）确保依赖树已完全初始化 | P0 |
| F12.2 | Explorer 面板从隐藏状态变为可见时（onDidChangeVisibility），检查当前 editor 并 reveal | P0 |
| F12.3 | 无论 lazyMode 是否开启，自动 reveal 功能均有效 | P0 |

### 2.13 动态 Stdlib 添加 [P1 - 重要]

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| F13 | 当文件在 $GOROOT/src/ 下但 findNodeForFile 找不到匹配 dep 时，动态添加标准库包 | P1 |
| F13.1 | 从文件路径提取包名，支持多级路径（如 net/http、internal/fmtsort） | P1 |
| F13.2 | 调用 addStdlibDep 动态添加到 stdlibDeps 集合 | P1 |
| F13.3 | 重新搜索 findNodeForFile，确保动态添加的标准库包能被找到 | P1 |

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
| `goDepsExplorer.lazyMode` | boolean | false | 是否启用懒加载模式（初始依赖树为空，Cmd+Click 跳转时才显示依赖） |

## 6. 界面图标需求 [P0 - 必须]

### 6.1 扩展图标

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| I1 | package.json 新增 `"icon": "icon.png"` 字段，用于扩展市场和扩展管理器展示 | P0 |
| I1.1 | 图标设计：Go 蓝色圆形背景 + 白色依赖树图案，尺寸 128x128px | P0 |
| I1.2 | 图标文件格式：PNG，支持透明背景 | P0 |

### 6.2 侧边栏图标

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| I2 | package.json view 新增 `"icon": "tree-icon.svg"` 字段，用于 activity bar 和侧边栏显示 | P0 |
| I2.1 | 图标设计：自定义树形图标，替代默认文件图标 | P0 |
| I2.2 | 图标文件格式：SVG，矢量图标确保各尺寸下清晰显示 | P0 |

### 6.3 侧边栏标题优化

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| I3 | package.json view 新增 `"contextualTitle": "Go Deps Explorer"` 字段 | P0 |
| I3.1 | 解决拖拽到侧边栏后悬浮提示显示"资源管理器"而非插件名称的问题 | P0 |
| I3.2 | 确保用户能够清楚识别插件功能和名称 | P0 |

## 7. 版本发布需求

| ID | 功能描述 | 优先级 |
|----|---------|--------|
| R1 | 每个版本需要创建 git tag (annotated tag) | P1 |
| R1.1 | 每个版本需要创建对应的 GitHub Release | P1 |
| R1.2 | 所有用户可见文本（界面、提示、错误信息）统一使用英文 | P0 |

## 8. v0.1.11 版本变更记录

### 问题修复

| 问题编号 | 问题描述 | 根本原因 | 修复方案 |
|---------|----------|----------|----------|
| BUG-0111-01 | Cmd+Click 跳转到 Go 标准库代码时无法定位 | editorTracker.isDependencyFile() 中用了 Promise 检测 GOROOT，但函数返回 boolean 不是 async，Promise 作为 truthy 直接返回 true | 在 EditorTracker 构造时通过 `go env GOROOT` 缓存 gorootSrc 路径，isDependencyFile 同步检查 |
| BUG-0111-02 | 标准库文件跳转定位失败 | findNodeForFile() 只搜索 this.projects（模块依赖），不搜索 this.stdlibDeps（标准库依赖） | findNodeForFile 增加对 stdlibDeps 的遍历，确保标准库文件也能正确定位 |

### 技术改进

| 改进项 | 描述 | 影响范围 |
|--------|------|----------|
| 异步到同步重构 | EditorTracker.isDependencyFile() 方法从异步改为同步实现 | 提升跳转响应速度，消除 Promise 误用 |
| GOROOT 缓存机制 | 新增 EditorTracker.gorootSrc 属性和 initGoroot() 方法 | 避免重复执行 `go env GOROOT` 命令 |
| 标准库依赖搜索 | findNodeForFile() 支持搜索标准库依赖节点 | 完整支持标准库文件跳转定位 |

## 测试验收清单

1. ✅ 打开包含 go.mod 的项目，侧边栏自动显示依赖树
2. ✅ 直接依赖和间接依赖有明确视觉区分
3. ✅ 每个依赖显示名称+版本，hover 显示详情
4. ✅ 点击依赖可展开目录，点击文件以只读方式打开
5. ✅ 工作空间模式下按项目分组显示
6. ✅ Cmd+Click 跳转到依赖代码时，依赖树自动定位展开
7. ✅ 修改 go.mod 后依赖树自动刷新
8. ✅ replace 指令可通过设置控制
9. ✅ **v0.1.20 新增**：在依赖包源码中能够 Cmd+Click 跳转到其他依赖/标准库，gopls 语言服务器正常工作