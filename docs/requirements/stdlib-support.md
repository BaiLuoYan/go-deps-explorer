# 标准库支持

## 修订记录

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2026-03-20 | PM | 初始版本 |

## 1. 功能描述

在依赖树中新增 "Standard Library" 分类，展示项目中使用的所有 Go 标准库包，支持浏览源码和动态添加未收集到的标准库包。

## 2. 用户场景

**作为** Go 开发者，**我希望** 在依赖树中看到项目使用了哪些标准库包并能浏览其源码，**以便** 快速查阅标准库实现。

## 3. 功能清单

| ID | 功能 | 优先级 |
|----|------|--------|
| F4.1 | "Standard Library" 分类节点，展示项目使用的所有标准库包 | P1 |
| F4.2 | 通过 `go list -json ./...` 获取项目 import 列表 | P1 |
| F4.3 | 收集 Imports、TestImports、XTestImports、Deps 四个字段中的标准库包 | P1 |
| F4.4 | 标准库包源码路径：`$GOROOT/src/{pkgName}` | P1 |
| F4.5 | 标准库包使用 `symbol-package` 图标（区别于普通依赖的 `package` 图标） | P1 |
| F4.6 | 标准库包 version 固定为 `stdlib` | P1 |
| F4.7 | 动态添加：当 Cmd+Click 跳转到 GOROOT/src 下的文件但树中无对应包时，自动添加 | P1 |
| F4.8 | 动态添加支持多级路径（如 `net/http`、`internal/fmtsort`） | P1 |

## 4. 标准库识别规则

通过前缀匹配判断是否为标准库包：
- 已知前缀列表：`archive/`、`bufio`、`bytes`、`compress/`、`container/`、`context`、`crypto/`、`database/`、`debug/`、`embed`、`encoding/`、`errors`、`fmt`、`go/`、`hash/`、`html/`、`image/`、`io`、`log`、`math`、`mime`、`net`、`os`、`path`、`reflect`、`regexp`、`runtime`、`sort`、`strconv`、`strings`、`sync`、`syscall`、`testing`、`text/`、`time`、`unicode`、`unsafe` 等
- 补充规则：不包含 `.` 且不包含 `/` 的包名视为标准库

## 5. 输入/输出

### 输入
- `go list -json ./...` 命令输出
- `go env GOROOT` 获取标准库路径
- Cmd+Click 跳转的目标文件路径

### 输出
- Standard Library 分类节点及其下的标准库包节点

## 6. 约束条件

- GOROOT 获取失败时，尝试环境变量 `$GOROOT`，再 fallback 到常见路径 `/usr/local/go/src`、`/usr/lib/go/src`
- 动态添加的标准库包在 refresh 后会重新通过 go list 收集
- 标准库包不区分直接/间接，统一归入 Standard Library 分类
