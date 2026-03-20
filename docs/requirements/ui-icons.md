# 界面与图标

## 修订记录

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2026-03-20 | PM | 初始版本 |

## 1. 功能描述

扩展的视觉标识，包括 Marketplace 展示图标、侧边栏视图图标、标题信息，以及树节点的图标体系。

## 2. 用户场景

**作为** VSCode 用户，**我希望** 扩展有清晰的图标标识，**以便** 在扩展市场和侧边栏中快速识别。

## 3. 功能清单

| ID | 功能 | 优先级 |
|----|------|--------|
| I1.1 | 扩展图标 `icon.png`：128×128px PNG，Go 蓝色圆形背景 + 白色依赖树图案 | P0 |
| I1.2 | 侧边栏视图图标 `tree-icon.svg`：SVG 矢量图标 | P0 |
| I1.3 | contextualTitle 设为 "Go Deps Explorer"，解决拖拽到侧边栏后悬浮提示不正确的问题 | P0 |
| I1.4 | TreeView 支持 Collapse All 按钮（`showCollapseAll: true`） | P0 |

## 4. 输入/输出

### 输入
- icon.png 和 tree-icon.svg 图标文件

### 输出
- Marketplace 展示图标
- 侧边栏 Activity Bar 图标
- 面板标题和悬浮提示

## 5. 约束条件

- icon.png 必须为 PNG 格式，支持透明背景
- tree-icon.svg 必须为 SVG 格式，确保各尺寸清晰
- 所有用户可见文本使用英文
