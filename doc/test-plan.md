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

### 2.5 新增测试用例 (v0.1.1-v0.1.9)

| 测试编号 | 测试用例描述 | 输入数据 | 预期结果 |
|---------|-------------|----------|----------|
| **TC-NEW-01** | **go.mod 多 require 块解析** | **包含多个 require 块的 go.mod 文件** | **fallback 解析器正确解析所有块** |
| **TC-NEW-02** | **单行 require 解析** | **混合单行和块模式的 require** | **正确解析单行 require 语句** |
| **TC-NEW-03** | **多项目工作空间 lastProjectRoot 追踪** | **多项目工作空间中跳转到依赖文件** | **EditorTracker 记住正确的项目根目录** |
| **TC-NEW-04** | **精确路径展开** | **Cmd+Click 跳转到深层目录文件** | **只展开到目标文件路径，不展开所有目录** |
| **TC-NEW-05** | **源码不存在时 collapsibleState** | **依赖包源码路径不存在** | **DependencyNode 的 collapsibleState 为 None** |
| **TC-NEW-06** | **Tooltip 英文标签和换行** | **鼠标 hover 依赖包节点** | **显示英文标签且正确换行** |
| **TC-NEW-07** | **buildNodeChain 构建完整节点链** | **跳转到未展开的依赖文件** | **主动构建 project→category→dependency→directories→file 完整链路** |
| **TC-NEW-08** | **多项目工作空间下同一依赖包的节点 ID 独立性验证** | **工作空间中有两个项目都依赖 github.com/gin-gonic/gin@v1.9.1** | **两个项目中的同名依赖拥有不同的节点 ID，包含各自的 projectRoot 前缀，展开定位时不会混淆** |
| **TC-NEW-09** | **标准库包解析和展示** | **项目中 import fmt, net/http, os 等标准库包** | **依赖树显示 "Standard Library" 分类节点，展示所有项目使用的标准库包** |
| **TC-NEW-10** | **标准库包 Cmd+Click 定位** | **Cmd+Click 跳转到 fmt.Println 源码** | **自动在依赖树中定位到 fmt 包节点并高亮选中** |
| **TC-NEW-11** | **Replace 依赖图标显示** | **go.mod 中包含 replace github.com/user/pkg => ../local/pkg** | **该依赖包在树中显示 arrow-swap 图标和 "→ replaced" 描述** |
| **TC-NEW-12** | **Replace 依赖 tooltip 显示替换信息** | **鼠标 hover 被 replace 的依赖包** | **tooltip 显示完整的替换信息：原路径 → 替换路径** |

| **TC-NEW-13** | **标准库文件跳转定位验证（v0.1.11 修复）** | **Cmd+Click 跳转到 Go 标准库代码（如 fmt/print.go）** | **依赖树自动定位到对应的标准库包节点，正确展开并高亮选中目标文件** |

| **TC-NEW-14** | **测试文件中 import 的标准库包展示验证（v0.1.12 新增）** | **项目中有测试文件 import testing, testify 等包，同时有传递依赖使用其他标准库包** | **依赖树的"Standard Library"节点显示所有来源的标准库包：直接 import、测试文件 import、以及传递依赖中的标准库包** |

| **TC-NEW-15** | **多项目工作空间中同一标准库文件在不同项目间 Cmd+Click 切换定位验证（v0.1.13 修复）** | **工作空间包含项目A和项目B，两者都使用 fmt 包。用户先在项目A中 Cmd+Click 跳转到 fmt/print.go，再在项目B中跳转到同一文件** | **每次跳转都正确定位到对应项目的 fmt 标准库节点，不会因为缓存导致总是定位到第一个项目** |

| **TC-NEW-16** | **handleReplace=false 时依赖显示原始路径且无 replace 图标（v0.1.14 新增）** | **go.mod 包含 replace github.com/user/pkg => ../local/pkg，设置 handleReplace=false** | **该依赖包在树中显示原始路径 github.com/user/pkg@version，无 arrow-swap 图标，无 "→ replaced" 描述** |

| **TC-NEW-17** | **handleReplace=true 时依赖显示替换路径和 replace 图标（v0.1.14 验证）** | **go.mod 包含 replace github.com/user/pkg => ../local/pkg，设置 handleReplace=true** | **该依赖包在树中显示替换后路径，带有 arrow-swap 图标和 "→ replaced" 描述** |

| **TC-NEW-18** | **工作空间模式下项目节点名称和顺序验证（v0.1.19 新增）** | **.code-workspace 文件定义项目名称为 "Frontend"、"Backend"、"Shared"，对应目录为 web/、api/、common/** | **依赖树中项目节点按 workspace 文件中的名称显示（Frontend、Backend、Shared）和顺序排列，而不是目录名称（web、api、common）** |

| **TC-NEW-19** | **依赖源码内跳转支持验证（v0.1.20 新增）** | **在依赖包源码文件中 Cmd+Click 跳转到其他依赖包或标准库** | **依赖源码文件使用原生 file:// URI 打开，gopls 能正常索引，支持跳转到其他依赖包，同时依赖树能正确定位到跳转目标所在的依赖包节点** |

| **TC-NEW-20** | **lazyMode=false 时行为不变（v0.2.0 新增）** | **设置 goDepsExplorer.lazyMode=false，打开包含 Go 项目的工作空间** | **依赖树显示所有直接依赖、间接依赖和标准库包，行为与之前版本完全一致** |

| **TC-NEW-21** | **lazyMode=true 初始依赖树为空（v0.2.0 新增）** | **设置 goDepsExplorer.lazyMode=true，打开包含 Go 项目的工作空间** | **依赖树初始为空，不显示任何依赖包、分类节点或项目节点** |

| **TC-NEW-22** | **Cmd+Click 跳转后对应依赖出现在树中（v0.2.0 新增）** | **lazyMode=true，Cmd+Click 跳转到某个依赖包源码文件** | **该依赖包自动出现在依赖树的对应分类中，并展开到跳转的目标文件** |

| **TC-NEW-23** | **多次跳转后之前的依赖保留（v0.2.0 新增）** | **lazyMode=true，先跳转到依赖包A，再跳转到依赖包B** | **依赖树中同时显示依赖包A和依赖包B，之前跳转过的依赖包不会消失** |

| **TC-NEW-25** | **默认折叠状态验证（v0.2.0 新增）** | **打开包含 Go 项目的工作空间，查看依赖树初始状态** | **所有 Project 节点和 Category 节点默认为 Collapsed 状态，无论 lazyMode 是否开启** |

| **TC-NEW-26** | **启动时自动 reveal（v0.2.0 新增）** | **VSCode 启动时当前 active editor 为依赖包源码文件** | **启动 1 秒后自动检查当前 editor，如果是依赖文件则自动 reveal 并定位到依赖树中对应的文件节点** |

| **TC-NEW-27** | **面板可见时自动 reveal（v0.2.0 新增）** | **Explorer 面板从隐藏状态变为可见，当前 editor 为依赖包源码文件** | **面板变为可见时（onDidChangeVisibility）自动检查当前 editor 并 reveal 定位** |

| **TC-NEW-28** | **动态 stdlib 添加（v0.2.0 新增）** | **Cmd+Click 跳转到 $GOROOT/src/internal/fmtsort/sort.go（不在初始 go list 输出中）** | **从文件路径提取包名 "internal/fmtsort"，调用 addStdlibDep 动态添加到 stdlibDeps，重新搜索 findNodeForFile 成功定位** |

| **TC-NEW-29** | **buildNodeChain stdlib category 正确性（v0.2.0 修复）** | **跳转到标准库文件，检查 buildNodeChain 构建的节点链** | **dep.version === 'stdlib' 的依赖放在 "Standard Library" category 下，不会错误放在 "Direct Dependencies"** |

### 2.6 新增功能测试用例 (v0.1.11 - 标准库与 Replace)

| 测试编号 | 测试用例描述 | 输入数据 | 预期结果 |
|---------|-------------|----------|----------|
| **SP-001** | **Go 标准库包解析（v0.1.12 增强）** | **项目代码 import fmt, net/http, os；测试文件 import testing, testify；传递依赖使用其他标准库包** | **parseStdlibDeps 从 Imports + TestImports + XTestImports + Deps 四个字段收集所有标准库包** |
| **SP-002** | **标准库包路径判断** | **包路径 "fmt"、"net/http"、"github.com/user/pkg"** | **前两个判断为标准库，第三个不是** |
| **SP-003** | **$GOROOT/src 路径构建** | **标准库包 "net/http"** | **返回 $GOROOT/src/net/http 路径** |
| **SP-004** | **标准库包图标区分** | **标准库包节点** | **使用 library 图标区别于普通依赖** |
| **RP-001** | **Replace 依赖图标检测** | **go.mod 包含 replace 指令的依赖** | **DependencyNode 使用 arrow-swap 图标** |
| **RP-002** | **Replace 描述文本显示** | **被 replace 的依赖包节点** | **description 字段显示 "→ replaced"** |
| **RP-003** | **Replace tooltip 信息** | **replace 依赖的 hover tooltip** | **显示完整替换信息：原路径 → 目标路径** |
| **RP-004** | **$GOROOT/src 路径检测** | **EditorTracker 检测 /usr/local/go/src/fmt/print.go** | **isDependencyFile 返回 true** |

### 2.7 新增功能测试用例 (v0.1.11 - Bug 修复验证)

| 测试编号 | 测试用例描述 | 输入数据 | 预期结果 |
|---------|-------------|----------|----------|
| **BF-001** | **EditorTracker GOROOT 缓存机制** | **构造 EditorTracker 实例** | **自动执行 initGoroot()，gorootSrc 字段缓存 $GOROOT/src 路径** |
| **BF-002** | **isDependencyFile 同步检查** | **标准库文件路径（如 /usr/local/go/src/fmt/print.go）** | **使用缓存的 gorootSrc 同步返回 true，无异步 Promise** |
| **BF-003** | **findNodeForFile 标准库搜索** | **标准库文件路径和多个项目的依赖树** | **遍历所有项目的 stdlibDeps，找到匹配的标准库依赖节点** |
| **BF-004** | **标准库文件跳转定位完整流程** | **用户 Cmd+Click 跳转到 fmt.Println 源码** | **EditorTracker → findNodeForFile → buildNodeChain → treeView.reveal 完整流程正常工作** |
| **BF-005** | **GOROOT 获取失败的错误处理** | **go env GOROOT 命令执行失败** | **gorootSrc 保持 undefined，不影响其他路径检查，输出错误日志到 Output Channel** |

### 2.8 新增功能测试用例 (v0.1.20)

| 测试编号 | 测试用例描述 | 输入数据 | 预期结果 |
|---------|-------------|----------|----------|
| **RF-001** | **ReadonlyFileViewer 原生 file:// URI 打开** | **依赖包源码文件路径** | **使用 vscode.Uri.file() 直接打开，不使用自定义 scheme** |
| **RF-002** | **gopls 索引依赖源码文件** | **依赖包中的 Go 源码文件** | **gopls 能正常索引和解析文件，提供代码高亮和跳转支持** |
| **RF-003** | **依赖源码内跳转到其他依赖** | **在依赖包 A 的源码中 Cmd+Click 跳转到依赖包 B** | **成功跳转到依赖包 B 的源码，并在依赖树中定位到包 B 节点** |
| **RF-004** | **依赖源码内跳转到标准库** | **在依赖包源码中 Cmd+Click 跳转到标准库 (如 fmt.Println)** | **成功跳转到标准库源码，并在依赖树中定位到对应的标准库节点** |

### 2.9 新增功能测试用例 (v0.2.0 懒加载模式)

| 测试编号 | 测试用例描述 | 输入数据 | 预期结果 |
|---------|-------------|----------|----------|
| **LM-001** | **ConfigManager lazyMode 配置读取** | **goDepsExplorer.lazyMode 设置为 true/false** | **configManager.lazyMode 返回正确的 boolean 值** |
| **LM-002** | **revealedDeps 数据结构初始化** | **DependencyTreeProvider 初始化** | **revealedDeps 为空 Set，workspaceState 为 undefined** |
| **LM-003** | **createDepKey 格式验证** | **projectRoot="/project", dep.path="github.com/gin-gonic/gin", dep.version="v1.9.1"** | **返回 "/project:github.com/gin-gonic/gin@v1.9.1"** |
| **LM-004** | **revealDep 添加和持久化** | **调用 revealDep(root, dep)** | **depKey 添加到 revealedDeps，触发 persistRevealedDeps()，发送 tree refresh 事件** |
| **LM-005** | **workspaceState 恢复机制** | **workspaceState 包含之前保存的 revealedDeps 数据** | **setWorkspaceState() 调用后，revealedDeps 恢复到之前状态** |
| **LM-006** | **lazy mode 下 getChildren 过滤** | **CategoryNode，包含 5 个依赖，只有 2 个在 revealedDeps 中** | **getChildren() 只返回 2 个 DependencyNode** |
| **LM-007** | **非 lazy mode 下 getChildren 不过滤** | **lazyMode=false，CategoryNode 包含所有依赖** | **getChildren() 返回所有依赖的 DependencyNode** |
| **LM-008** | **buildCategories 分类过滤** | **lazy mode 下，直接依赖有已展示包，间接依赖没有** | **只返回 "直接依赖" CategoryNode，隐藏 "间接依赖"** |
| **LM-009** | **workspace mode 项目过滤** | **多项目工作空间，只有项目A有已展示依赖，项目B没有** | **根节点只返回项目A的 ProjectNode** |
| **LM-011** | **默认折叠状态配置（v0.2.0 新增）** | **创建 ProjectNode 和 CategoryNode** | **getTreeItem() 返回 TreeItemCollapsibleState.Collapsed，无论 lazyMode 设置** |

| **LM-012** | **启动时自动 reveal 机制（v0.2.0 新增）** | **EditorTracker 构造时，setTimeout 1s 后检查 active editor** | **如果当前 editor 是依赖文件，自动触发 reveal 和定位** |

| **LM-013** | **onDidChangeVisibility 监听（v0.2.0 新增）** | **Explorer 面板从隐藏变为可见，当前 editor 为依赖文件** | **触发 checkCurrentEditorAndReveal()，自动 reveal 定位** |

| **LM-014** | **动态 stdlib 包提取（v0.2.0 新增）** | **文件路径 "/usr/local/go/src/internal/fmtsort/sort.go"** | **extractPackageFromPath() 返回 "internal/fmtsort"** |

| **LM-015** | **addStdlibDep 动态添加（v0.2.0 新增）** | **调用 addStdlibDep(projectRoot, "internal/fmtsort")** | **将新的 stdlib dep 添加到对应项目的 stdlibDeps 数组，避免重复添加** |

| **LM-016** | **buildNodeChain stdlib 判断（v0.2.0 修复）** | **dep.version = 'stdlib'** | **categoryType 计算结果为 'stdlib'，节点放在 "Standard Library" 分类下** |

| **LM-017** | **EditorTracker disposables 管理（v0.2.0 新增）** | **创建 EditorTracker 实例** | **所有事件监听器添加到 disposables 数组，dispose() 时正确清理** |

### 2.10 新增功能测试用例 (v0.2.4 会话级只读模式)

| 测试编号 | 测试用例描述 | 输入数据 | 预期结果 |
|---------|-------------|----------|----------|
| **RO-001** | **ReadonlyFileViewer 会话级只读设置** | **点击依赖包源码文件节点** | **文件以 file:// URI 打开，随后调用 workbench.action.files.setActiveEditorReadonlyInSession 命令** |
| **RO-002** | **VS Code 1.79+ 只读模式验证** | **在支持该命令的 VS Code 版本中打开依赖源码文件** | **文件在编辑器中显示为只读状态，无法编辑但保持语法高亮和跳转功能** |
| **RO-003** | **VS Code < 1.79 兼容性降级** | **在不支持该命令的 VS Code 版本中打开依赖源码文件** | **命令执行失败但被 try/catch 捕获，错误信息输出到 Output Channel，文件正常打开可编辑** |
| **RO-004** | **会话级只读特性验证** | **关闭 VS Code 后重新打开同一依赖源码文件（通过文件系统）** | **文件可正常编辑，只读限制仅存在于设置时的会话中** |
| **RO-005** | **try/catch 异常处理** | **模拟命令执行异常情况** | **异常被正确捕获，用户体验不受影响，错误信息记录到 Output Channel** |
| **RO-006** | **gopls 语言服务器兼容性** | **在只读状态的依赖源码文件中验证代码高亮、跳转、智能提示** | **所有 gopls 功能正常工作，与 v0.1.20 行为一致** |

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
| F3.2 | 多项目独立节点管理 | TC-NEW-08 | 单元测试 |
| F4 | Go 标准库包展示 | SP-001~SP-004, TC-NEW-09, TC-NEW-10 | 单元测试 + 集成测试 |
| F4.1 | 标准库包解析和过滤（v0.1.12 增强：四字段收集） | SP-001, SP-002 | 单元测试 |
| F4.2 | 标准库源码路径构建 | SP-003 | 单元测试 |
| F4.3 | 标准库包图标区分 | SP-004 | 单元测试 |
| F4.4 | 标准库包跳转定位 | TC-NEW-10, RP-004, BF-001~BF-005, TC-NEW-13 | 集成测试 |
| F7 | 依赖源码内跳转支持（v0.1.20 新增） | TC-NEW-19, RF-001~RF-004 | 单元测试 + 集成测试 |
| F7.1 | 使用原生 file:// URI 打开依赖源码 | RF-001 | 单元测试 |
| F7.2 | gopls 兼容性支持 | RF-002 | 集成测试 |
| F7.3 | 依赖间跳转定位 | RF-003, RF-004 | 集成测试 |

### 3.2 P1 需求覆盖

| 需求 ID | 需求描述 | 测试覆盖 | 测试类型 |
|---------|----------|----------|----------|
| F5 | Replace 依赖特殊图标 | RP-001~RP-004, TC-NEW-11, TC-NEW-12 | 单元测试 + 集成测试 |
| F5.1 | Replace 图标使用 | RP-001 | 单元测试 |
| F5.2 | Replace 描述文本 | RP-002 | 单元测试 |
| F5.3 | Replace tooltip 信息 | RP-003, TC-NEW-12 | 单元测试 + 集成测试 |
| F6 | Replace 指令处理 | GP-004, CM-001 | 单元测试 |
| F6.1 | handleReplace 设置项 | CM-001 | 单元测试 |
| F6.2 | Replace 路径覆盖逻辑 | GP-004 | 单元测试 |
| F6.3 | 本地路径 tooltip | - | 集成测试 |
| F8 | 懒加载模式（v0.2.0 新增） | LM-001~LM-010, TC-NEW-20~TC-NEW-24 | 单元测试 + 集成测试 |
| F8.1 | 初始状态为空 | TC-NEW-21, LM-002 | 集成测试 |
| F8.2 | 跳转时自动显示 | TC-NEW-22, LM-004, LM-010 | 集成测试 |
| F8.3 | 累积保留依赖 | TC-NEW-23, LM-006 | 集成测试 |
| F8.4 | 持久化存储 | TC-NEW-24, LM-005 | 集成测试 |
| F8.5 | 兼容性保证 | TC-NEW-20, LM-007 | 集成测试 |
| F8.6 | 分类过滤 | LM-008 | 单元测试 |
| F8.7 | 项目过滤 | LM-009 | 单元测试 |

---

## 4. v0.1.11 版本变更测试重点

### 4.1 回归测试检查点

| 检查项 | 测试方法 | 验收标准 |
|--------|----------|----------|
| 标准库文件跳转响应时间 | 手动测试：Cmd+Click 跳转到不同标准库文件 | 响应时间 < 500ms，无卡顿现象 |
| 多项目工作空间标准库定位 | 多项目环境下跳转标准库代码 | 正确定位到源项目的标准库节点 |
| GOROOT 路径检测准确性 | 不同系统环境下测试 | 正确检测 /usr/local/go/src、/opt/go/src 等路径 |
| 异步改同步性能提升 | 性能基准测试 | 跳转响应时间相比 v0.1.10 有明显提升 |

### 4.2 边界条件测试

| 边界条件 | 测试场景 | 预期行为 |
|----------|----------|----------|
| GOROOT 未设置 | 环境变量 GOROOT 为空 | 使用默认路径，不抛出异常 |
| go 命令不存在 | PATH 中无 go 命令 | 优雅降级，输出错误日志 |
| 标准库源码缺失 | $GOROOT/src 目录不存在 | isDependencyFile 返回 false，不影响其他功能 |
| 混合路径类型跳转 | 同时跳转模块依赖和标准库 | 两种类型文件都能正确定位 |

## 5. v0.1.20 版本变更测试重点

### 5.1 ReadonlyFileViewer 重构验证

| 检查项 | 测试方法 | 验收标准 |
|--------|----------|----------|
| 原生 file:// URI 打开 | 手动测试：点击依赖包中的文件节点 | 文件使用 vscode.Uri.file() 打开，无自定义 scheme |
| gopls 语言服务器索引 | 检查依赖源码文件的语法高亮和智能提示 | gopls 正常工作，提供完整的语言服务支持 |
| 依赖源码内跳转 | 在依赖包源码中 Cmd+Click 跳转到其他依赖 | 成功跳转并在依赖树中正确定位 |
| 代码简化验证 | 对比 v0.1.19 代码复杂度 | 移除 TextDocumentContentProvider，代码行数减少 |

### 5.2 跨依赖跳转测试场景

| 测试场景 | 操作步骤 | 预期结果 |
|----------|----------|----------|
| 依赖A → 依赖B | 在依赖包A源码中跳转到依赖包B的函数 | 打开依赖包B源码，依赖树定位到包B |
| 依赖 → 标准库 | 在依赖包源码中跳转到标准库函数 | 打开标准库源码，依赖树定位到标准库节点 |
| 标准库 → 依赖 | 在标准库源码中跳转到项目依赖 | 打开项目依赖源码，依赖树正确定位 |
| 多层依赖跳转 | A依赖B，B依赖C，从A跳转到C | 跳转链路完整，最终定位到依赖C |

---

## 6. 测试数据准备

### 6.1 模拟 go list 输出

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

### 6.2 复杂嵌套 JSON 示例

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

### 6.3 大量模块测试数据

生成 12 个不同模块的 JSON 流，验证性能和正确性。

### 6.4 v0.1.11 标准库路径测试数据

```bash
# 模拟不同系统的 GOROOT 路径
/usr/local/go/src/fmt/print.go          # Linux/macOS 标准路径
/opt/go/src/net/http/server.go          # 自定义安装路径
C:\Go\src\os\file.go                    # Windows 标准路径
/home/user/go/src/encoding/json/       # 用户自定义 GOROOT
```

---

## 7. 测试环境要求

### 7.1 开发环境

- Node.js 18+
- TypeScript 5.3+
- VSCode 1.75.0+

### 7.2 测试执行

```bash
# 运行单元测试
npm run test

# 或直接执行
node test/unit-tests.js

# 编译 TypeScript 测试文件
npx tsc test/unit-tests.ts --target es2020 --module commonjs
```

### 7.3 覆盖率目标

- **单元测试覆盖率**: ≥ 85%
- **核心功能覆盖**: 100%（JSON 解析、路径提取、配置管理）
- **边界条件覆盖**: 100%（空输入、异常格式、错误路径）

---

## 8. 测试计划执行时间表

| 阶段 | 任务 | 预计时间 |
|------|------|----------|
| 阶段 1 | 编写单元测试代码（扩充现有测试） | 2 小时 |
| 阶段 2 | 执行单元测试，修复发现的 bug | 1 小时 |
| 阶段 2.5 | v0.1.11 回归测试（标准库跳转） | 1 小时 |
| 阶段 3 | 集成测试（手动验证） | 3 小时 |
| 阶段 4 | 性能测试（大量依赖场景） | 1 小时 |
| **总计** | | **8 小时** |

---

## 9. 风险评估

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