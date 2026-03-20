# 自动刷新

## 修订记录

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2026-03-20 | PM | 初始版本 |

## 1. 功能描述

监听 go.mod 文件的变化（修改、创建、删除），自动刷新依赖树；同时提供手动刷新按钮和配置变更时自动刷新。

## 2. 用户场景

**作为** Go 开发者，**我希望** 修改 go.mod 后依赖树自动更新，**以便** 始终看到最新的依赖状态。

## 3. 功能清单

| ID | 功能 | 优先级 |
|----|------|--------|
| F6.1 | 监听 `**/go.mod` 文件的 change/create/delete 事件 | P0 |
| F6.2 | 防抖处理：go.mod 变化后延迟 1 秒刷新，避免频繁触发 | P0 |
| F6.3 | 手动刷新按钮：面板标题栏的 refresh 图标 | P0 |
| F6.4 | 配置变更时自动刷新：任何 `goDepsExplorer.*` 配置改变时重新加载 | P0 |
| F6.5 | 刷新时清空节点缓存（nodeMap），重新解析所有项目 | P0 |

## 4. 输入/输出

### 输入
- `vscode.workspace.createFileSystemWatcher('**/go.mod')` 事件
- 手动触发 `goDepsExplorer.refresh` 命令
- `vscode.workspace.onDidChangeConfiguration` 事件

### 输出
- 依赖树完全重新加载

## 5. 约束条件

- 防抖间隔 1000ms
- 刷新过程异步执行，不阻塞 UI
- 保留 projectOrder 和 projectNames，刷新后项目顺序不变
- lazyMode 下 revealedDeps 集合不受刷新影响（持久化在 workspaceState 中）
