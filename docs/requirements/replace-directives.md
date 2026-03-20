# Replace 指令处理

## 修订记录

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2026-03-20 | PM | 初始版本 |

## 1. 功能描述

识别并展示 go.mod 中 replace 指令的依赖，提供特殊图标标识和详细的替换信息 tooltip，并通过配置项控制是否处理 replace。

## 2. 用户场景

**作为** Go 开发者，**我希望** 一眼识别哪些依赖被 replace 了以及替换到哪里，**以便** 快速排查因 replace 导致的版本或路径问题。

## 3. 功能清单

| ID | 功能 | 优先级 |
|----|------|--------|
| F7.1 | Replace 依赖使用 `arrow-swap` 图标 | P1 |
| F7.2 | Replace 依赖名称旁显示 `→ replaced` 描述文本 | P1 |
| F7.3 | Hover tooltip 显示替换详情：原路径 → 替换路径@版本、替换后的本地路径 | P1 |
| F7.4 | 配置项 `handleReplace`（默认 true）控制是否处理 replace | P1 |
| F7.5 | handleReplace=true：源码路径使用 replace 目标路径 | P1 |
| F7.6 | handleReplace=false：忽略 replace，显示并使用原始依赖路径 | P1 |
| F7.7 | handleReplace=false 时，若 dep.dir 被 replace 污染，跳过 dir 使用 GOPATH 原始路径 | P1 |

## 4. 输入/输出

### 输入
- `go list -m -json all` 输出中的 Replace 字段
- 配置项 `goDepsExplorer.handleReplace`

### 输出
- 特殊图标和描述文本
- 正确的源码路径（根据配置决定使用原始或替换路径）

## 5. Replace 数据结构

```typescript
replace?: {
  path: string;     // 替换目标模块路径（可以是本地路径）
  version?: string;  // 替换目标版本（本地路径时无版本）
  dir?: string;      // 替换后的实际目录
}
```

## 6. 约束条件

- replace 到本地路径的依赖，tooltip 需显示本地路径信息
- handleReplace 配置变更后自动刷新依赖树
