# ConfigManager 配置管理设计

## 修订记录
| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0  | 2026-03-20 | DEV | 基于v0.2.5源码重构配置管理文档 |

## 1. 模块概述

### 1.1 职责定义
ConfigManager负责管理VSCode扩展的用户配置，提供类型安全的配置访问接口。作为配置的统一入口，为其他模块提供响应式的配置服务。

### 1.2 设计目标
- **类型安全**：为每个配置项提供强类型访问方法
- **响应式更新**：配置变更时通知相关模块
- **默认值管理**：为每个配置项提供合理的默认值
- **向后兼容**：新配置项不影响现有功能

## 2. 配置架构设计

### 2.1 配置命名空间

所有配置项都在`goDepsExplorer`命名空间下：

```json
{
  "contributes": {
    "configuration": {
      "title": "Go Deps Explorer",
      "properties": {
        "goDepsExplorer.handleReplace": { },
        "goDepsExplorer.showIndirect": { },
        "goDepsExplorer.vendorFirst": { },
        "goDepsExplorer.lazyMode": { }
      }
    }
  }
}
```

### 2.2 ConfigManager 类设计

```typescript
export class ConfigManager {
  // 配置访问器（只读属性）
  get handleReplace(): boolean
  get showIndirect(): boolean  
  get vendorFirst(): boolean
  get lazyMode(): boolean
  
  // 配置变更监听
  onConfigChange(callback: () => void): vscode.Disposable
}
```

## 3. 配置项详细说明

### 3.1 handleReplace（Replace指令处理）

```typescript
get handleReplace(): boolean {
  return vscode.workspace.getConfiguration('goDepsExplorer').get('handleReplace', true);
}
```

**配置定义**：
```json
{
  "goDepsExplorer.handleReplace": {
    "type": "boolean",
    "default": true,
    "description": "是否处理 go.mod 中的 replace 指令"
  }
}
```

**行为说明**：
- `true`（默认）：显示replace后的模块路径和版本，使用替换后的源码位置
- `false`：显示原始模块路径和版本，忽略replace指令，使用原始GOPATH位置

**使用场景**：
- 调试replace配置问题
- 查看replace前后的差异
- 在replace导致路径错误时的降级方案

### 3.2 showIndirect（间接依赖显示）

```typescript
get showIndirect(): boolean {
  return vscode.workspace.getConfiguration('goDepsExplorer').get('showIndirect', true);
}
```

**配置定义**：
```json
{
  "goDepsExplorer.showIndirect": {
    "type": "boolean", 
    "default": true,
    "description": "是否显示间接依赖"
  }
}
```

**行为说明**：
- `true`（默认）：在依赖树中显示"Indirect Dependencies"分类
- `false`：隐藏间接依赖分类，仅显示直接依赖

**使用场景**：
- 简化依赖树显示，关注核心依赖
- 减少大型项目的依赖树复杂度
- 新手用户避免困惑

### 3.3 vendorFirst（Vendor优先策略）

```typescript
get vendorFirst(): boolean {
  return vscode.workspace.getConfiguration('goDepsExplorer').get('vendorFirst', false);
}
```

**配置定义**：
```json
{
  "goDepsExplorer.vendorFirst": {
    "type": "boolean",
    "default": false,
    "description": "优先使用 vendor 目录"
  }
}
```

**行为说明**：
- `true`：优先从`vendor/`目录读取依赖源码
- `false`（默认）：优先从`$GOPATH/pkg/mod`读取依赖源码

**路径选择逻辑**：
```
if (vendorFirst && vendor/{module} 存在):
    return vendor/{module}
else:
    return $GOPATH/pkg/mod/{module}@{version}
```

**使用场景**：
- 使用Go modules的vendor模式
- 离线开发环境
- 修改了vendor中的依赖代码

### 3.4 lazyMode（懒加载模式 v0.2.0）

```typescript
get lazyMode(): boolean {
  return vscode.workspace.getConfiguration('goDepsExplorer').get('lazyMode', false);
}
```

**配置定义**：
```json
{
  "goDepsExplorer.lazyMode": {
    "type": "boolean",
    "default": false,
    "description": "启用懒加载模式（初始依赖树为空，Cmd+Click 跳转时才显示依赖）"
  }
}
```

**行为说明**：
- `true`：初始依赖树为空，仅在跳转到依赖源码时才显示对应依赖包
- `false`（默认）：启动时显示完整依赖树

**渐进式体验**：
1. 首次启动：依赖树完全为空
2. Cmd+Click跳转：对应依赖包出现在树中
3. 持续开发：依赖树逐步完善
4. 重启保持：已访问的依赖包被持久化

## 4. 配置变更处理

### 4.1 变更监听机制

```typescript
onConfigChange(callback: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('goDepsExplorer')) {
      callback();
    }
  });
}
```

### 4.2 响应式更新流程

```typescript
// 在 extension.ts 中的使用
const configDisposable = config.onConfigChange(() => {
  treeProvider.refresh();
});
context.subscriptions.push(configDisposable);
```

**更新链路**：
```
用户修改设置 → onDidChangeConfiguration事件 → callback() → treeProvider.refresh() → 依赖树重新渲染
```

### 4.3 配置变更影响分析

| 配置项 | 变更后影响 | 是否需要重新解析 |
|--------|------------|------------------|
| handleReplace | 依赖路径和显示名称 | 否，仅影响路径计算 |
| showIndirect | 间接依赖分类可见性 | 否，仅影响过滤逻辑 |
| vendorFirst | 依赖源码路径 | 否，仅影响路径计算 |
| lazyMode | 依赖树过滤策略 | 否，仅影响显示逻辑 |

所有配置变更都不需要重新执行`go list`，仅影响数据展示和路径计算。

## 5. 配置访问模式

### 5.1 只读访问器模式

```typescript
class ConfigManager {
  // 使用 getter 而非普通方法，提供属性访问语法
  get handleReplace(): boolean {
    return vscode.workspace.getConfiguration('goDepsExplorer').get('handleReplace', true);
  }
}

// 使用方式
const useReplace = this.config.handleReplace; // 简洁的属性访问
```

### 5.2 实时获取策略

每次访问都调用`vscode.workspace.getConfiguration()`，确保获取最新配置值，支持配置的实时变更。

**权衡考虑**：
- **优点**：配置变更立即生效，无需手动同步
- **缺点**：频繁访问有微小性能开销
- **结论**：配置访问频率不高，实时性优势大于性能损失

## 6. 类型安全设计

### 6.1 强类型约束

```typescript
// 每个配置项都有明确的返回类型
get handleReplace(): boolean  // 而非 any 或 unknown
get showIndirect(): boolean
get vendorFirst(): boolean  
get lazyMode(): boolean
```

### 6.2 默认值保证

```typescript
// 使用 get() 方法的第二个参数提供默认值
return vscode.workspace.getConfiguration('goDepsExplorer').get('handleReplace', true);
//                                                                                ^^^^
//                                                                          fallback默认值
```

确保即使用户未设置配置项，也能获得合理的默认行为。

## 7. 扩展性设计

### 7.1 新配置项添加

添加新配置项的步骤：

1. **package.json中声明**：
```json
{
  "goDepsExplorer.newSetting": {
    "type": "boolean",
    "default": false,
    "description": "新配置项说明"
  }
}
```

2. **ConfigManager中添加访问器**：
```typescript
get newSetting(): boolean {
  return vscode.workspace.getConfiguration('goDepsExplorer').get('newSetting', false);
}
```

3. **在使用模块中读取**：
```typescript
if (this.config.newSetting) {
  // 新配置启用的逻辑
}
```

### 7.2 配置分组管理

随着配置项增多，可以考虑按功能分组：

```typescript
class ConfigManager {
  // 解析相关配置
  get parsing() {
    return {
      handleReplace: this.handleReplace,
      vendorFirst: this.vendorFirst,
    };
  }
  
  // 显示相关配置
  get display() {
    return {
      showIndirect: this.showIndirect,
      lazyMode: this.lazyMode,
    };
  }
}
```

### 7.3 配置验证

```typescript
get handleReplace(): boolean {
  const value = vscode.workspace.getConfiguration('goDepsExplorer').get('handleReplace', true);
  if (typeof value !== 'boolean') {
    console.warn('Invalid handleReplace config, using default true');
    return true;
  }
  return value;
}
```

## 8. 测试策略

### 8.1 配置mock

```typescript
// 测试中模拟配置
const mockConfig = {
  handleReplace: false,
  showIndirect: true,
  vendorFirst: true,
  lazyMode: false
};

const configManager = new ConfigManager();
// 注入mock配置的方法...
```

### 8.2 配置变更测试

```typescript
// 测试配置变更响应
const callback = jest.fn();
const disposable = configManager.onConfigChange(callback);

// 模拟配置变更
// ...

expect(callback).toHaveBeenCalled();
```

## 9. 性能考虑

### 9.1 配置访问开销

- **单次开销**：`getConfiguration()`调用开销很小（微秒级）
- **频率分析**：配置访问主要在初始化和用户交互时，不在热路径上
- **缓存考虑**：由于VSCode内部已有缓存，无需在扩展层再次缓存

### 9.2 内存使用

ConfigManager作为轻量级单例，内存占用可忽略不计。

## 10. 向后兼容性

### 10.1 默认值策略

新配置项必须设置合理默认值，确保不影响现有功能。

### 10.2 配置迁移

如需重命名配置项：

```typescript
get newSettingName(): boolean {
  const config = vscode.workspace.getConfiguration('goDepsExplorer');
  
  // 先尝试新配置名
  if (config.has('newSettingName')) {
    return config.get('newSettingName', false);
  }
  
  // 降级到旧配置名
  if (config.has('oldSettingName')) {
    return config.get('oldSettingName', false);
  }
  
  return false; // 最终默认值
}
```

## 11. 用户体验优化

### 11.1 配置描述

每个配置项都有清晰的中文描述，帮助用户理解功能。

### 11.2 即时生效

除了需要重启VSCode的配置外，所有配置变更都能即时生效，提升用户体验。

### 11.3 合理分组

在VSCode设置界面中，相关配置项会自动聚合在"Go Deps Explorer"分组下。