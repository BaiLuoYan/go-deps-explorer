# Go Deps Explorer 产品需求文档 (PRD)

## 修订记录

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2026-03-20 | PM | 基于 v0.2.5 代码和旧需求文档重新整理 |

## 1. 项目概述

### 1.1 业务背景

Go 开发者在使用 VSCode 时，缺乏直观浏览项目依赖包源码的方式。虽然可以通过 `go mod` 命令管理依赖，但查看依赖源码需要手动定位 GOPATH 或 vendor 目录，效率低下。

### 1.2 项目目标

提供一个 VSCode 侧边栏扩展，让 Go 开发者能够：
- 在 Explorer 面板中直观浏览所有项目依赖（直接/间接/标准库）
- 点击即可只读查看依赖包源码
- Cmd+Click 跳转时自动在依赖树中定位
- 支持多项目工作空间

### 1.3 目标用户

使用 VSCode 开发 Go 项目的开发者，需要频繁查看依赖包源码、理解依赖关系。

### 1.4 技术栈

- 开发语言：TypeScript
- 运行平台：VSCode Extension（最低版本 1.75.0）
- 依赖工具：Go 工具链（go list、go env）
- 发布渠道：VSCode Marketplace

## 2. 功能模块概览

| 模块 | 文档 | 优先级 | 说明 |
|------|------|--------|------|
| 依赖树展示 | [dependency-tree.md](dependency-tree.md) | P0 | 核心树形结构展示 |
| 目录浏览与只读查看 | [directory-browsing.md](directory-browsing.md) | P0 | 展开目录、只读打开文件 |
| 工作空间支持 | [workspace-support.md](workspace-support.md) | P0 | 单项目/多项目/mono-repo |
| 标准库支持 | [stdlib-support.md](stdlib-support.md) | P1 | 标准库包展示与动态添加 |
| 跳转定位 | [jump-tracking.md](jump-tracking.md) | P0 | Cmd+Click 跳转自动定位 |
| 自动刷新 | [auto-refresh.md](auto-refresh.md) | P0 | go.mod 变化监听与刷新 |
| Replace 指令 | [replace-directives.md](replace-directives.md) | P1 | replace 依赖的展示与处理 |
| 懒加载模式 | [lazy-mode.md](lazy-mode.md) | P1 | 按需显示依赖 |
| 界面与图标 | [ui-icons.md](ui-icons.md) | P0 | 扩展图标、侧边栏图标 |

## 3. 配置项汇总

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `goDepsExplorer.handleReplace` | boolean | true | 是否处理 go.mod 中的 replace 指令 |
| `goDepsExplorer.showIndirect` | boolean | true | 是否显示间接依赖 |
| `goDepsExplorer.vendorFirst` | boolean | false | 优先使用 vendor 目录 |
| `goDepsExplorer.lazyMode` | boolean | false | 懒加载模式 |

## 4. 非功能需求

| ID | 类别 | 描述 |
|----|------|------|
| NF1 | 兼容性 | 支持 VSCode 1.75.0+，Mac/Windows/Linux |
| NF2 | 性能 | 目录树懒加载，避免大量依赖时卡顿；go list 输出缓冲区 10MB |
| NF3 | 激活条件 | 工作区包含 go.mod 文件时自动激活 |
| NF4 | 国际化 | 所有用户可见文本统一使用英文 |
| NF5 | 诊断 | 通过 Output Channel "Go Deps Explorer" 提供诊断日志 |
| NF6 | 发布 | 发布到 VSCode Marketplace，每个版本创建 Git tag 和 GitHub Release |
| NF7 | 依赖 | 需要用户环境安装 Go 工具链 |

## 5. 激活与命令

### 5.1 激活条件
- `workspaceContains:**/go.mod` — 工作区存在 go.mod 时激活
- 设置 context `goDepsExplorer.hasGoMod` 控制视图显示

### 5.2 注册命令
| 命令 | 说明 |
|------|------|
| `goDepsExplorer.refresh` | 手动刷新依赖树（标题栏刷新按钮） |
| `goDepsExplorer.openFile` | 以只读方式打开依赖文件 |
