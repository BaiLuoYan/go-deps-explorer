# 构建与发布流程

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0  | 2026-03-20 | OPS | 初始版本 |

## 1. 构建流程

### 1.1 预构建检查清单
发布前必须确认以下项目：
- [ ] **代码质量**: 所有测试通过（`npm run test`）
- [ ] **代码规范**: ESLint 检查通过（`npm run lint`）
- [ ] **TypeScript**: 类型检查通过（`npx tsc --noEmit`）
- [ ] **版本号**: `package.json` 中版本号已更新
- [ ] **更新日志**: `CHANGELOG.md` 已更新新版本内容
- [ ] **README**: 功能描述和版本信息已更新

### 1.2 构建命令
```bash
# 进入代码目录
cd go-deps-explorer/code

# 清理之前的构建产物
rm -rf out/
rm -rf *.vsix

# 安装依赖（确保最新）
npm ci

# 运行预发布脚本（编译 TypeScript）
npm run vscode:prepublish

# 验证构建产物
ls out/  # 应包含 extension.js 等文件
```

### 1.3 打包扩展
```bash
# 打包成 VSIX 文件
npm run package
# 等价于: vsce package

# 验证打包结果
ls *.vsix  # 应生成 go-deps-explorer-{版本}.vsix

# 检查包内容
vsce ls  # 列出将要打包的文件
```

## 2. 发布到 Marketplace

### 2.1 获取发布令牌

#### 2.1.1 创建 Azure DevOps 个人访问令牌
1. 访问 [Azure DevOps](https://dev.azure.com/)
2. 登录后点击右上角头像 → Personal Access Tokens
3. 点击 "New Token"
4. 配置令牌：
   - **Name**: VSCode Extension Publishing
   - **Organization**: All accessible organizations
   - **Scopes**: Custom defined → Marketplace → Manage
5. 复制生成的令牌（仅显示一次）

#### 2.1.2 配置发布身份
```bash
# 使用令牌登录（首次发布需要）
vsce login BaiLuoYan
# 提示时输入个人访问令牌

# 验证登录状态
vsce ls-publishers
```

### 2.2 发布到 Marketplace
```bash
# 方式1: 直接发布（推荐）
npm run publish
# 等价于: vsce publish

# 方式2: 发布指定版本
vsce publish 0.2.6

# 方式3: 发布预发布版本
vsce publish --pre-release
```

### 2.3 发布后验证
1. **Marketplace 页面**: 访问 [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=BaiLuoYan.go-deps-explorer)
2. **版本更新**: 确认新版本已显示
3. **安装测试**: 在 VSCode 中搜索并安装新版本
4. **功能验证**: 测试核心功能是否正常

## 3. 版本管理

### 3.1 语义化版本控制
遵循 [Semantic Versioning 2.0.0](https://semver.org/):
- **MAJOR**: 不兼容的 API 变更（如 1.x.x → 2.0.0）
- **MINOR**: 向后兼容的功能新增（如 0.2.x → 0.3.0）
- **PATCH**: 向后兼容的问题修复（如 0.2.5 → 0.2.6）

### 3.2 版本号更新流程
```bash
# 更新到下一个补丁版本
npm version patch  # 0.2.5 → 0.2.6

# 更新到下一个次要版本
npm version minor  # 0.2.5 → 0.3.0

# 更新到下一个主要版本
npm version major  # 0.2.5 → 1.0.0

# 手动指定版本
npm version 0.2.6
```

### 3.3 Git 标签管理
```bash
# npm version 会自动创建 Git 标签
git tag  # 查看所有标签

# 推送标签到远程仓库
git push origin --tags

# 删除错误的标签（本地）
git tag -d v0.2.5

# 删除错误的标签（远程）
git push origin --delete v0.2.5
```

## 4. 发布检查清单

### 4.1 发布前检查
- [ ] **代码测试**: `npm run test` 通过
- [ ] **代码质量**: `npm run lint` 无错误
- [ ] **版本更新**: `package.json` 版本号已递增
- [ ] **变更记录**: `CHANGELOG.md` 新版本内容已添加
- [ ] **构建成功**: `npm run vscode:prepublish` 无错误
- [ ] **打包成功**: `vsce package` 生成 .vsix 文件
- [ ] **本地验证**: 手动安装 .vsix 文件测试功能

### 4.2 发布后验证
- [ ] **Marketplace**: 新版本在 VSCode Marketplace 可见
- [ ] **安装测试**: 从 Marketplace 安装新版本成功
- [ ] **功能测试**: 核心功能正常工作
- [ ] **Git 标签**: 版本标签已推送到 GitHub

## 5. 回滚方案

### 5.1 Marketplace 回滚
**VSCode Marketplace 不支持直接回滚**，但可以：
1. **发布修复版本**: 快速修复问题并发布新版本
2. **联系支持**: 严重问题可联系 Microsoft 支持下架版本

### 5.2 用户降级
用户可以通过以下方式使用旧版本：
1. **禁用自动更新**: VSCode 设置中禁用扩展自动更新
2. **安装旧版 VSIX**: 从 GitHub Releases 下载旧版本 VSIX 文件
3. **版本锁定**: 在 VSCode 中手动选择特定版本

## 6. 自动化发布（CI/CD）

### 6.1 GitHub Actions 示例
```yaml
name: Release Extension

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: |
          cd code
          npm ci
          
      - name: Run tests
        run: |
          cd code
          npm run test:unit
          
      - name: Build extension
        run: |
          cd code
          npm run vscode:prepublish
          
      - name: Publish to Marketplace
        run: |
          cd code
          npx vsce publish -p ${{ secrets.VSCE_TOKEN }}
```

### 6.2 环境变量配置
在 GitHub 仓库设置中添加：
- `VSCE_TOKEN`: Azure DevOps 个人访问令牌

## 7. 常见问题

### 7.1 发布权限问题
**问题**: `vsce publish` 提示 "Permission denied"
**解决**: 
1. 确认已使用 `vsce login BaiLuoYan` 登录
2. 检查个人访问令牌权限（需要 Marketplace → Manage）
3. 确认 publisher 名称匹配 `package.json` 中的设置

### 7.2 版本冲突
**问题**: 发布时提示版本已存在
**解决**:
1. 更新 `package.json` 中的版本号
2. 确保版本号大于 Marketplace 当前版本
3. 重新打包并发布

### 7.3 打包文件过大
**问题**: VSIX 文件体积过大
**解决**:
1. 检查 `.vscodeignore` 文件，排除不必要的文件
2. 移除 `devDependencies` 中不需要的包
3. 使用 `vsce ls` 查看打包文件列表

### 7.4 扩展激活失败
**问题**: 发布后扩展无法正常激活
**解决**:
1. 检查 `package.json` 中的 `activationEvents` 配置
2. 确认 `main` 字段指向正确的入口文件
3. 验证 TypeScript 编译输出的文件路径