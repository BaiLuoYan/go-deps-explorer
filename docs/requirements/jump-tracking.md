# 跳转定位

## 修订记录

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2026-03-20 | PM | 初始版本 |

## 1. 功能描述

用户在代码中 Cmd+Click（Mac）/ Ctrl+Click（Win/Linux）跳转到依赖包或标准库文件时，依赖树自动定位并高亮到对应的文件节点。同时支持启动时和面板可见性变化时的自动定位。

## 2. 用户场景

**作为** Go 开发者，**我希望** Cmd+Click 跳转到依赖源码时，侧边栏依赖树自动展开到对应文件，**以便** 了解该文件在依赖包中的位置。

## 3. 功能清单

| ID | 功能 | 优先级 |
|----|------|--------|
| F5.1 | 监听 activeTextEditor 变化，检测到依赖文件时触发定位 | P0 |
| F5.2 | 精确路径展开：只展开到目标文件路径上的目录，不展开所有目录 | P0 |
| F5.3 | 高亮/选中目标文件节点（select: true, focus: false） | P0 |
| F5.4 | 多项目工作空间：通过 lastProjectRoot 追踪用户来源项目，优先定位到对应项目 | P0 |
| F5.5 | 依赖源码内跳转：在依赖包源码中 Cmd+Click 跳转到其他依赖/标准库时，同样自动定位 | P0 |
| F5.6 | 启动时自动定位：延迟 1 秒检查当前 active editor，如果是依赖文件则自动 reveal | P0 |
| F5.7 | 面板可见性变化时自动定位：Explorer 面板从隐藏变为可见时检查当前 editor | P0 |
| F5.8 | 跳转打开的依赖文件自动标记为会话级只读 | P0 |
| F5.9 | 依赖树不可见时跳过 reveal（不强制打开 Explorer 面板） | P0 |

## 4. 依赖文件判断规则

文件路径满足以下任一条件即为依赖文件：
1. 路径在 `$GOPATH/pkg/mod/` 下
2. 路径在工作区任一项目的 `vendor/` 目录下
3. 路径在 `$GOROOT/src/` 下（标准库）

## 5. 节点查找流程

1. 优先从 nodeMap 缓存中查找（按 preferredProjectRoot 优先）
2. 缓存未命中时，遍历所有项目的依赖和标准库依赖，匹配文件路径前缀
3. 多个匹配时优先返回 preferredProjectRoot 对应的结果
4. 找到匹配后，主动构建完整节点链（Project → Category → Dependency → Directory... → File）

### 标准库动态添加
当文件在 GOROOT/src 下但未找到匹配节点时：
1. 从路径提取包名（支持多级如 `net/http`）
2. 调用 `addStdlibDep` 动态添加
3. 重新查找节点

## 6. 输入/输出

### 输入
- `vscode.window.onDidChangeActiveTextEditor` 事件
- `treeView.onDidChangeVisibility` 事件
- 文件的 `fsPath`

### 输出
- `treeView.reveal(node)` 展开并选中目标节点

## 7. 约束条件

- GOROOT 通过 `go env GOROOT` 异步获取并缓存，启动时初始化
- lastProjectRoot 通过检查编辑器文件所属 workspaceFolder 更新
- reveal 失败时通过 Output Channel 记录日志，不影响用户操作
