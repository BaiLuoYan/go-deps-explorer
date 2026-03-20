# 开发环境搭建指南

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0  | 2026-03-20 | OPS | 初始版本 |

## 1. 系统要求

### 1.1 运行环境
- **操作系统**: Windows 10+, macOS 10.14+, Linux (Ubuntu 18.04+)
- **Node.js**: 18.x 或更高版本 (推荐 18.19.0+)
- **npm**: 8.x 或更高版本
- **VSCode**: 1.75.0 或更高版本

### 1.2 Go 环境（开发调试需要）
- **Go**: 1.18 或更高版本
- **PATH 环境变量**: `go` 命令可执行

## 2. 开发环境安装

### 2.1 安装 Node.js
```bash
# 使用 nvm 安装（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18.19.0
nvm use 18.19.0

# 验证安装
node --version  # 应显示 v18.19.0+
npm --version   # 应显示 8.x+
```

### 2.2 安装 VSCode Extension 开发工具
```bash
# 安装 vsce（VSCode Extension Manager）
npm install -g @vscode/vsce

# 验证安装
vsce --version
```

### 2.3 安装开发依赖
```bash
# 克隆项目
git clone https://github.com/BaiLuoYan/go-deps-explorer.git
cd go-deps-explorer/code

# 安装依赖
npm install

# 验证依赖安装
npm list --depth=0
```

## 3. 开发工具配置

### 3.1 VSCode 推荐扩展
安装以下扩展以提升开发体验：
- **TypeScript Hero** - TypeScript 代码整理和导入管理
- **ESLint** - 代码规范检查
- **Prettier** - 代码格式化
- **GitLens** - Git 增强功能

### 3.2 TypeScript 配置检查
确认 `tsconfig.json` 配置正确：
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "commonjs",
    "outDir": "out",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "exclude": ["node_modules", ".vscode-test"]
}
```

## 4. 开发调试

### 4.1 编译项目
```bash
# 开发模式编译（监听文件变化）
npm run watch

# 或者单次编译
npm run compile
```

### 4.2 运行调试
1. 在 VSCode 中打开项目（`code go-deps-explorer/code`）
2. 按 `F5` 启动扩展宿主（Extension Development Host）
3. 在新打开的 VSCode 窗口中打开一个包含 `go.mod` 的 Go 项目
4. 验证 "Go Dependencies" 面板是否正常显示

### 4.3 运行测试
```bash
# 运行单元测试
npm run test:unit

# 运行集成测试（需要 VSCode 环境）
npm run test
```

## 5. 代码质量检查

### 5.1 ESLint 检查
```bash
# 运行 lint 检查
npm run lint

# 自动修复可修复的问题
npm run lint -- --fix
```

### 5.2 类型检查
```bash
# TypeScript 类型检查
npx tsc --noEmit
```

## 6. 常见问题

### 6.1 Node.js 版本不兼容
**问题**: `npm install` 失败，提示 Node.js 版本过低
**解决**: 升级 Node.js 到 18.x 或更高版本

### 6.2 vsce 命令不存在
**问题**: `vsce: command not found`
**解决**: 
```bash
npm install -g @vscode/vsce
# 或者使用 npx
npx @vscode/vsce --version
```

### 6.3 Go 环境问题
**问题**: 扩展无法检测到 Go 项目依赖
**解决**: 
1. 确认 `go` 命令在 PATH 中可执行
2. 确认项目根目录存在 `go.mod` 文件
3. 运行 `go mod download` 下载依赖

### 6.4 VSCode 调试模式无响应
**问题**: 按 F5 后新窗口无法加载扩展
**解决**:
1. 确认项目已编译：`npm run compile`
2. 检查 `.vscode/launch.json` 配置
3. 重启 VSCode 后重试

## 7. 开发工作流

### 7.1 推荐的开发流程
1. **修改代码** → 代码自动编译（watch 模式）
2. **F5 调试** → 在新窗口验证功能
3. **运行测试** → 确保回归测试通过
4. **Lint 检查** → 确保代码规范
5. **提交代码** → Git commit

### 7.2 调试技巧
- 使用 `console.log()` 输出调试信息到 Developer Console
- 使用 VSCode 断点调试 TypeScript 代码
- 观察扩展宿主的输出面板（Output → Go Deps Explorer）