# 懒加载模式

## 修订记录

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2026-03-20 | PM | 初始版本 |

## 1. 功能描述

提供 lazyMode 配置，开启后依赖树初始为空，仅当用户通过 Cmd+Click 跳转到依赖源码时才将该依赖显示在树中，已展示的依赖持久化保留。

## 2. 用户场景

**作为** 拥有大量依赖的 Go 项目开发者，**我希望** 依赖树只显示我实际访问过的依赖，**以便** 减少视觉噪音，专注于当前关注的依赖。

## 3. 功能清单

| ID | 功能 | 优先级 |
|----|------|--------|
| F10.1 | 配置项 `goDepsExplorer.lazyMode`（boolean，默认 false） | P1 |
| F10.2 | lazyMode=true 时，初始依赖树为空 | P1 |
| F10.3 | Cmd+Click 跳转到依赖源码时，该依赖自动出现在树中 | P1 |
| F10.4 | 累积保留：已展示的依赖不会消失 | P1 |
| F10.5 | 持久化：通过 workspaceState 存储 revealedDeps，重启后恢复 | P1 |
| F10.6 | lazyMode=false 时行为与正常模式完全一致 | P1 |
| F10.7 | 分类过滤：隐藏没有已展示依赖的 Category 节点 | P1 |
| F10.8 | 项目过滤：多项目模式下隐藏没有已展示依赖的 Project 节点 | P1 |
| F10.9 | 自动 reveal 功能在 lazyMode 下同样有效 | P1 |

## 4. 数据持久化

- 存储键：`revealedDeps`（workspaceState）
- 存储格式：`string[]`，每项为 `{projectRoot}:{depPath}@{version}`
- 写入时机：每次新增 revealed dep 后立即保存
- 读取时机：扩展激活时从 workspaceState 恢复

## 5. 输入/输出

### 输入
- 配置项 `goDepsExplorer.lazyMode`
- EditorTracker 调用 `revealDep(root, dep)` 标记依赖为已展示
- workspaceState 中的持久化数据

### 输出
- 过滤后的依赖树（仅显示 revealedDeps 中的依赖）

## 6. 约束条件

- revealedDeps 集合不受 refresh 影响
- 刷新只重新加载依赖数据，不清空 revealed 状态
- 切换 lazyMode 配置后立即生效（触发刷新）
