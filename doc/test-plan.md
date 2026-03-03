# Go Dependencies Explorer — 测试计划

**文档版本**: v1.0  
**日期**: 2026-03-03  
**状态**: 待审核

---

## 1. 测试策略

### 1.1 单元测试

**范围**: 核心功能模块的纯函数和数据处理逻辑
- **目标文件**: `test/unit-tests.ts`
- **测试框架**: Node.js 内置 `assert` 模块
- **覆盖范围**: 所有可独立测试的纯函数
- **执行方式**: `npm run test` 或 `node test/unit-tests.js`

**重点测试模块**:
- `GoModParser.parseJsonStream()`: JSON 流解析逻辑
- `EditorTracker.extractModuleFromPath()`: 文件路径到模块映射
- `ConfigManager`: 配置项默认值和验证
- Go.mod 文本解析正则表达式

### 1.2 集成测试

**范围**: 跨模块交互和 VSCode API 集成
- **执行环境**: VSCode Extension Development Host
- **测试内容**: 扩展激活、TreeView 渲染、命令执行
- **手动验证**: 由于涉及 VSCode API，主要通过手动测试验证

**集成测试场景**:
1. 扩展在包含 go.mod 的项目中正确激活
2. 依赖树正确显示直接/间接依赖
3. 点击依赖包展开目录结构
4. 文件跳转定位功能工作正常
5. go.mod 变更后依赖树自动刷新

---

## 2. 功能模块测试用例

### 2.1 GoModParser - JSON 流解析

| 测试编号 | 测试用例描述 | 输入数据 | 预期结果 |
|---------|-------------|----------|----------|
| GP-001 | 空输入处理 | `""` | 返回空数组 `[]` |
| GP-002 | 单个模块解析 | 包含单个 JSON 对象的字符串 | 解析出 1 个模块对象 |
| GP-003 | 多个模块解析（go list 格式） | 包含 3 个连续 JSON 对象的字符串 | 解析出 3 个模块对象 |
| GP-004 | 包含 replace 的模块 | 带有 Replace 字段的 JSON 对象 | 正确解析 Replace 路径和目录 |
| GP-005 | 包含空白字符的输入 | 带有换行和空格的 JSON 流 | 忽略空白字符，正确解析 |
| GP-006 | 完整字段的模块 | 包含所有字段的复杂 JSON 对象 | 所有字段都被正确解析 |
| **GP-007** | **嵌套 JSON 对象** | **包含嵌套对象的 JSON 流** | **正确处理嵌套结构** |
| **GP-008** | **空对象处理** | **`{}{}`** | **解析出 2 个空对象** |
| **GP-009** | **大量模块（10+）** | **包含 12 个模块的 JSON 流** | **解析出所有 12 个模块** |

### 2.2 EditorTracker - 路径解析

| 测试编号 | 测试用例描述 | 输入数据 | 预期结果 |
|---------|-------------|----------|----------|
| ET-001 | 标准模块路径 | GOPATH/pkg/mod/github.com/gin-gonic/gin@v1.9.1/gin.go | modulePath: "github.com/gin-gonic/gin", version: "v1.9.1" |
| ET-002 | 带子目录的模块路径 | GOPATH/pkg/mod/golang.org/x/sys@v0.15.0/unix/syscall.go | modulePath: "golang.org/x/sys", version: "v0.15.0" |
| ET-003 | 非模块路径 | /home/user/myproject/main.go | 返回 null |
| ET-004 | 缺少版本的路径 | GOPATH/pkg/mod/some/path/without/version | 返回 null |
| ET-005 | 预发布版本 | GOPATH/pkg/mod/example.com/pkg@v0.0.0-20231215085349-abc123/file.go | 正确解析预发布版本 |
| ET-006 | 大写模块路径（Go 编码） | GOPATH/pkg/mod/github.com/!azure/azure-sdk@v1.0.0/sdk.go | 正确处理大写字母编码 |
| **ET-007** | **vendor 路径模式** | **projectRoot/vendor/github.com/gin-gonic/gin/gin.go** | **返回 null（需要额外逻辑处理 vendor）** |
| **ET-008** | **空路径** | **`""`** | **返回 null** |
| **ET-009** | **根路径等于 modCache** | **GOPATH/pkg/mod** | **返回 null** |

### 2.3 ConfigManager - 配置默认值

| 测试编号 | 测试用例描述 | 配置项 | 预期默认值 |
|---------|-------------|-------|------------|
| **CM-001** | **handleReplace 默认值** | **goDepsExplorer.handleReplace** | **true** |
| **CM-002** | **showIndirect 默认值** | **goDepsExplorer.showIndirect** | **true** |
| **CM-003** | **vendorFirst 默认值** | **goDepsExplorer.vendorFirst** | **false** |

### 2.4 Go.mod Fallback 解析

| 测试编号 | 测试用例描述 | 输入数据 | 预期结果 |
|---------|-------------|----------|----------|
| **GM-001** | **基本 require 解析** | **`require github.com/gin-gonic/gin v1.9.1`** | **提取出 github.com/gin-gonic/gin@v1.9.1** |
| **GM-002** | **多行 require 块** | **包含多个依赖的 require 块** | **解析出所有依赖** |
| **GM-003** | **带注释的 require** | **包含行尾注释的 require 行** | **忽略注释，正确解析依赖** |
| **GM-004** | **间接依赖标记** | **`require example.com/pkg v1.0.0 // indirect`** | **标记为间接依赖** |

### 2.5 新增测试用例 (v0.1.1-v0.1.8)

| 测试编号 | 测试用例描述 | 输入数据 | 预期结果 |
|---------|-------------|----------|----------|
| **TC-NEW-01** | **go.mod 多 require 块解析** | **包含多个 require 块的 go.mod 文件** | **fallback 解析器正确解析所有块** |
| **TC-NEW-02** | **单行 require 解析** | **混合单行和块模式的 require** | **正确解析单行 require 语句** |
| **TC-NEW-03** | **多项目工作空间 lastProjectRoot 追踪** | **多项目工作空间中跳转到依赖文件** | **EditorTracker 记住正确的项目根目录** |
| **TC-NEW-04** | **精确路径展开** | **Cmd+Click 跳转到深层目录文件** | **只展开到目标文件路径，不展开所有目录** |
| **TC-NEW-05** | **源码不存在时 collapsibleState** | **依赖包源码路径不存在** | **DependencyNode 的 collapsibleState 为 None** |
| **TC-NEW-06** | **Tooltip 英文标签和换行** | **鼠标 hover 依赖包节点** | **显示英文标签且正确换行** |
| **TC-NEW-07** | **buildNodeChain 构建完整节点链** | **跳转到未展开的依赖文件** | **主动构建 project→category→dependency→directories→file 完整链路** |

---

## 3. P0/P1 需求覆盖映射

### 3.1 P0 需求覆盖

| 需求 ID | 需求描述 | 测试覆盖 | 测试类型 |
|---------|----------|----------|----------|
| F1 | 依赖树展示 | GP-001~GP-009, CM-001~CM-003 | 单元测试 |
| F1.1 | 依赖获取（go.mod + go.sum） | GP-003, GP-004, GM-001~GM-004, TC-NEW-01, TC-NEW-02 | 单元测试 |
| F1.2 | 直接/间接依赖显示 | GP-003, GM-004 | 单元测试 |
| F1.3 | 英文分类标签 | TC-NEW-06 | 集成测试 |
| F1.4 | 依赖包显示格式 | GP-002, GP-006 | 单元测试 |
| F1.5 | Hover 详情显示（英文） | TC-NEW-06 | 集成测试 |
| F1.6 | 源码不可用标识 | TC-NEW-05 | 单元测试 |
| F2 | 依赖包目录浏览 | - | 集成测试 |
| F2.1 | vendor/GOPATH 路径优先级 | ET-007, CM-003 | 单元测试 |
| F2.2 | 只读文件打开 | - | 集成测试 |
| F2.3 | go.mod fallback 解析 | GM-001~GM-004, TC-NEW-01, TC-NEW-02 | 单元测试 |
| F2.4 | Output Channel 诊断 | - | 集成测试 |
| F3 | 工作空间支持 | - | 集成测试 |
| F3.1 | 多项目分组显示 | TC-NEW-03 | 集成测试 |
| F4 | 跳转定位 | ET-001~ET-009, TC-NEW-07 | 单元测试 |
| F4.1 | 精确路径展开 | TC-NEW-04 | 集成测试 |
| F4.2 | 高亮选中文件 | - | 集成测试 |
| F4.3 | 多项目正确定位 | TC-NEW-03 | 集成测试 |
| F5 | 自动刷新 | - | 集成测试 |
| F5.1 | 手动刷新按钮 | - | 集成测试 |

### 3.2 P1 需求覆盖

| 需求 ID | 需求描述 | 测试覆盖 | 测试类型 |
|---------|----------|----------|----------|
| F6 | Replace 指令处理 | GP-004, CM-001 | 单元测试 |
| F6.1 | handleReplace 设置项 | CM-001 | 单元测试 |
| F6.2 | Replace 路径覆盖逻辑 | GP-004 | 单元测试 |
| F6.3 | 本地路径 tooltip | - | 集成测试 |

---

## 4. 测试数据准备

### 4.1 模拟 go list 输出

```json
{
  "Path": "myproject",
  "Main": true,
  "GoVersion": "1.21"
}
{
  "Path": "github.com/gin-gonic/gin",
  "Version": "v1.9.1",
  "Indirect": false,
  "Dir": "/home/go/pkg/mod/github.com/gin-gonic/gin@v1.9.1"
}
{
  "Path": "golang.org/x/sys",
  "Version": "v0.15.0",
  "Indirect": true,
  "Dir": "/home/go/pkg/mod/golang.org/x/sys@v0.15.0"
}
```

### 4.2 复杂嵌套 JSON 示例

```json
{
  "Path": "github.com/complex/module",
  "Version": "v2.0.0",
  "Replace": {
    "Path": "github.com/local/fork",
    "Version": "v2.0.1",
    "Dir": "/home/user/local/fork",
    "GoMod": "/home/user/local/fork/go.mod"
  },
  "Require": [
    {"Path": "golang.org/x/crypto", "Version": "v0.17.0"}
  ]
}
```

### 4.3 大量模块测试数据

生成 12 个不同模块的 JSON 流，验证性能和正确性。

---

## 5. 测试环境要求

### 5.1 开发环境

- Node.js 18+
- TypeScript 5.3+
- VSCode 1.75.0+

### 5.2 测试执行

```bash
# 运行单元测试
npm run test

# 或直接执行
node test/unit-tests.js

# 编译 TypeScript 测试文件
npx tsc test/unit-tests.ts --target es2020 --module commonjs
```

### 5.3 覆盖率目标

- **单元测试覆盖率**: ≥ 85%
- **核心功能覆盖**: 100%（JSON 解析、路径提取、配置管理）
- **边界条件覆盖**: 100%（空输入、异常格式、错误路径）

---

## 6. 测试计划执行时间表

| 阶段 | 任务 | 预计时间 |
|------|------|----------|
| 阶段 1 | 编写单元测试代码（扩充现有测试） | 2 小时 |
| 阶段 2 | 执行单元测试，修复发现的 bug | 1 小时 |
| 阶段 3 | 集成测试（手动验证） | 3 小时 |
| 阶段 4 | 性能测试（大量依赖场景） | 1 小时 |
| **总计** | | **7 小时** |

---

## 7. 风险评估

| 风险项 | 影响程度 | 应对措施 |
|--------|----------|----------|
| VSCode API 变更 | 高 | 版本兼容性测试，及时更新依赖 |
| Go 命令输出格式变化 | 中 | JSON 流解析支持多种格式，添加错误处理 |
| 大型项目性能问题 | 中 | 懒加载策略，分页显示 |
| 跨平台路径差异 | 中 | 使用 Node.js path 模块标准化路径 |

---

**测试计划制定人**: 测试工程师  
**审核人**: 项目经理  
**批准时间**: 待定