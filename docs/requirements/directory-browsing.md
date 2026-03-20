# 目录浏览与只读查看

## 修订记录

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2026-03-20 | PM | 初始版本 |

## 1. 功能描述

展开依赖包节点后，以目录树形式浏览其完整源码结构；点击文件以会话级只读方式在编辑器中打开。

## 2. 用户场景

**作为** Go 开发者，**我希望** 点击依赖包后浏览其目录结构并只读查看源码，**以便** 理解依赖包的实现细节，同时避免误修改依赖源码。

## 3. 功能清单

| ID | 功能 | 优先级 |
|----|------|--------|
| F2.1 | 点击依赖包展开完整目录结构（懒加载，展开时才读取） | P0 |
| F2.2 | 目录排序：目录在前、文件在后，各自按字母排序 | P0 |
| F2.3 | 隐藏以 `.` 开头的隐藏文件/目录 | P0 |
| F2.4 | 点击文件以只读方式在编辑器中打开 | P0 |
| F2.5 | 会话级只读：调用 `workbench.action.files.setActiveEditorReadonlyInSession` | P0 |
| F2.6 | 兼容 VSCode < 1.79（只读命令不可用时 try/catch 静默忽略） | P0 |
| F2.7 | 使用 `file://` URI 打开文件（非自定义 scheme），确保 gopls 正常工作 | P0 |
| F2.8 | 文件节点使用 `resourceUri` 让 VSCode 自动匹配文件图标 | P0 |

## 4. 源码路径解析

优先级从高到低：

1. **vendorFirst=true 时**：检查 `{projectRoot}/vendor/{depPath}`
2. **go list 返回的 dir**：优先使用（handleReplace=true 且有 replace 时使用 replace.dir）
3. **GOPATH fallback**：`$GOPATH/pkg/mod/{depPath}@{version}`

特殊情况：当 handleReplace=false 但依赖有 replace 时，dep.dir 被 replace 污染，需跳过 dep.dir 直接使用 GOPATH 路径。

## 5. 输入/输出

### 输入
- 依赖包源码的文件系统路径
- 用户点击文件节点的交互事件

### 输出
- 目录/文件树节点
- 编辑器中只读打开的文件 Tab

## 6. 约束条件

- 目录不存在时返回空子节点
- 文件读取失败时静默处理
- 只读仅为会话级，重新打开文件后可正常编辑
- Cmd+Click 通过 gopls 跳转打开的依赖文件也需标记只读（由 EditorTracker 处理）
