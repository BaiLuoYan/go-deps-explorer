# Changelog

## [0.1.2] - 2026-03-03

### Fixed
- 修复 Cmd+Click 跳转到依赖库代码时，侧边栏依赖树无法自动展开定位的问题
  - 根因：reveal 使用临时节点对象，与树中实际节点引用不一致
  - 方案：添加节点缓存机制（categoryCache/dependencyCache/directoryCache/fileCache）
- 确认分类标签为中文显示（"直接依赖"/"间接依赖"）

## [0.1.1] - 2026-03-03

### Fixed
- 修复 Cmd+Click 跳转定位：添加节点缓存确保 reveal 引用一致性
- 代码审查修复：简化 readonlyFileViewer、统一 utils 使用、补全 eslintrc

## [0.1.0] - 2026-03-03

### Added
- 初始发布
- Explorer 侧边栏依赖树视图
- 直接/间接依赖分组显示
- 依赖包目录浏览（懒加载）
- 只读文件查看（自定义 URI scheme）
- Cmd+Click 跳转追踪与树定位
- 多项目工作空间支持
- go.mod 变更自动刷新
- 手动刷新按钮
- 配置项：handleReplace、showIndirect、vendorFirst
- 依赖详情 Tooltip（版本、路径、replace 信息、仓库链接）
