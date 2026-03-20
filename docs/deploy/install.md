# 用户安装指南

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0  | 2026-03-20 | OPS | 初始版本 |

## 1. 系统要求

### 1.1 最低要求
- **VSCode**: 1.75.0 或更高版本
- **Go**: 1.18 或更高版本（可选，用于项目开发）

### 1.2 支持的平台
- Windows 10/11
- macOS 10.14 或更高版本
- Linux (Ubuntu 18.04+, Fedora 28+, Debian 10+)

## 2. Marketplace 安装（推荐）

### 2.1 通过 VSCode 扩展面板安装
这是最简单和推荐的安装方式：

1. **打开 VSCode**
2. **访问扩展面板**:
   - 快捷键: `Ctrl+Shift+X` (Windows/Linux) 或 `Cmd+Shift+X` (macOS)
   - 或点击侧边栏的扩展图标 (![Extensions](https://code.visualstudio.com/assets/images/extensions-view-icon.png))
3. **搜索扩展**:
   - 在搜索框中输入: `go deps explorer`
   - 或直接搜索: `BaiLuoYan.go-deps-explorer`
4. **安装扩展**:
   - 找到 "Go Deps Explorer" 扩展（发布者: BaiLuoYan）
   - 点击绿色的 "Install" 按钮
5. **等待安装完成**，扩展会自动启用

### 2.2 通过命令行安装
```bash
# 使用 VSCode CLI 安装
code --install-extension BaiLuoYan.go-deps-explorer

# 验证安装
code --list-extensions | grep go-deps-explorer
```

### 2.3 通过 Marketplace 网页安装
1. 访问 [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=BaiLuoYan.go-deps-explorer)
2. 点击绿色的 "Install" 按钮
3. 浏览器会提示打开 VSCode
4. 在 VSCode 中确认安装

## 3. VSIX 文件手动安装

### 3.1 获取 VSIX 文件
**方式1: 从 GitHub Releases 下载**
1. 访问 [GitHub Releases](https://github.com/BaiLuoYan/go-deps-explorer/releases)
2. 选择目标版本（如 v0.2.5）
3. 下载对应的 `.vsix` 文件

**方式2: 自行构建**
```bash
# 克隆项目
git clone https://github.com/BaiLuoYan/go-deps-explorer.git
cd go-deps-explorer/code

# 安装依赖并构建
npm install
npm run vscode:prepublish

# 打包成 VSIX
npm run package
# 生成文件: go-deps-explorer-0.2.5.vsix
```

### 3.2 安装 VSIX 文件

#### 3.2.1 通过 VSCode 界面安装
1. **打开 VSCode**
2. **访问扩展面板** (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. **点击更多操作**:
   - 点击扩展面板右上角的 "..." 菜单
   - 选择 "Install from VSIX..."
4. **选择 VSIX 文件**:
   - 浏览并选择下载的 `.vsix` 文件
   - 点击 "Install"
5. **重启 VSCode**（如果提示）

#### 3.2.2 通过命令行安装
```bash
# 安装 VSIX 文件
code --install-extension go-deps-explorer-0.2.5.vsix

# 验证安装
code --list-extensions | grep go-deps-explorer
```

## 4. 安装验证

### 4.1 检查扩展状态
1. **打开扩展面板** (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. **搜索** "go deps explorer"
3. **确认状态**: 扩展应显示为 "Installed" 且已启用

### 4.2 功能验证
1. **打开 Go 项目**:
   - 确保项目根目录包含 `go.mod` 文件
   - 如果没有项目，可以创建测试项目：
   ```bash
   mkdir test-go-project
   cd test-go-project
   go mod init test
   echo 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello")\n}' > main.go
   ```

2. **验证扩展激活**:
   - 打开 VSCode 并加载 Go 项目
   - 查看资源管理器侧边栏
   - 应该能看到 "Go Dependencies" 面板

3. **测试基本功能**:
   - 点击 "Go Dependencies" 面板
   - 应该显示项目依赖树
   - 点击刷新按钮（![refresh](https://code.visualstudio.com/assets/images/refresh.svg)）测试刷新功能

## 5. 配置选项

安装完成后，可以通过 VSCode 设置自定义扩展行为：

### 5.1 打开设置
- **界面方式**: File → Preferences → Settings (Windows/Linux) 或 Code → Preferences → Settings (macOS)
- **快捷键**: `Ctrl+,` (Windows/Linux) 或 `Cmd+,` (macOS)

### 5.2 扩展配置项
搜索 "go deps explorer" 可找到以下配置：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `goDepsExplorer.handleReplace` | boolean | `true` | 是否处理 go.mod 中的 replace 指令 |
| `goDepsExplorer.showIndirect` | boolean | `true` | 是否显示间接依赖 |
| `goDepsExplorer.vendorFirst` | boolean | `false` | 优先使用 vendor 目录而非 GOPATH 模块缓存 |
| `goDepsExplorer.lazyMode` | boolean | `false` | 懒加载模式：仅在导航到源代码时显示依赖 |

### 5.3 配置示例
```json
{
    "goDepsExplorer.handleReplace": true,
    "goDepsExplorer.showIndirect": false,
    "goDepsExplorer.vendorFirst": true,
    "goDepsExplorer.lazyMode": false
}
```

## 6. 卸载扩展

### 6.1 通过 VSCode 界面卸载
1. **打开扩展面板** (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. **搜索** "go deps explorer"
3. **点击齿轮图标** → 选择 "Uninstall"
4. **重启 VSCode**（如果提示）

### 6.2 通过命令行卸载
```bash
# 卸载扩展
code --uninstall-extension BaiLuoYan.go-deps-explorer

# 验证卸载
code --list-extensions | grep go-deps-explorer
# 应该无输出
```

## 7. 常见问题

### 7.1 扩展无法安装
**问题**: Marketplace 安装失败或扩展面板无响应
**解决**:
1. **检查网络连接**，确保能访问 VSCode Marketplace
2. **重启 VSCode** 后重试
3. **清除扩展缓存**:
   ```bash
   # Windows
   rmdir /s "%USERPROFILE%\.vscode\extensions"
   
   # macOS/Linux
   rm -rf ~/.vscode/extensions/bailuoyan.go-deps-explorer*
   ```
4. **使用 VSIX 手动安装** 作为备选方案

### 7.2 扩展不显示或无法激活
**问题**: 安装后看不到 "Go Dependencies" 面板
**解决**:
1. **确认 Go 环境**:
   - 检查项目是否包含 `go.mod` 文件
   - 确认 `go` 命令可执行: `go version`
2. **检查激活条件**:
   - 扩展仅在检测到 `go.mod` 文件时激活
   - 确保在 VSCode 中打开了 Go 项目根目录
3. **重启 VSCode** 或重新加载窗口 (`Ctrl+Shift+P` → "Developer: Reload Window")

### 7.3 依赖显示不全或错误
**问题**: 依赖树显示不完整或错误信息
**解决**:
1. **更新 Go 模块**:
   ```bash
   go mod download
   go mod tidy
   ```
2. **刷新扩展**: 点击 "Go Dependencies" 面板中的刷新按钮
3. **检查扩展设置**: 确认 `showIndirect` 等设置符合预期
4. **查看输出日志**: VSCode → Output → "Go Deps Explorer"

### 7.4 版本冲突
**问题**: 手动安装 VSIX 后显示版本冲突
**解决**:
1. **先卸载现有版本**（通过扩展面板）
2. **重启 VSCode**
3. **重新安装 VSIX 文件**

### 7.5 性能问题
**问题**: 大型项目中扩展响应慢
**解决**:
1. **启用懒加载模式**: 设置 `goDepsExplorer.lazyMode` 为 `true`
2. **禁用间接依赖**: 设置 `goDepsExplorer.showIndirect` 为 `false`
3. **使用 vendor 模式**: 如果项目使用 vendor，设置 `goDepsExplorer.vendorFirst` 为 `true`

## 8. 升级扩展

### 8.1 自动升级
VSCode 默认会自动检查并升级扩展。如需禁用：
1. **打开设置** (`Ctrl+,` / `Cmd+,`)
2. **搜索**: "auto update"
3. **设置**: Extensions: Auto Update → 选择 "None" 或 "onlyEnabledExtensions"

### 8.2 手动升级
1. **打开扩展面板** (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. **查找有更新的扩展**（显示蓝色更新按钮）
3. **点击 "Update"** 按钮
4. **重启 VSCode**（如果提示）

### 8.3 检查版本
```bash
# 查看当前安装的版本
code --list-extensions --show-versions | grep go-deps-explorer
```