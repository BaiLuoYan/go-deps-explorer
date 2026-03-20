# EditorTracker 编辑器追踪器设计

## 修订记录
| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0  | 2026-03-20 | DEV | 基于v0.2.5源码重构编辑器追踪器文档 |

## 1. 模块概述

### 1.1 职责定义
EditorTracker负责监听VSCode编辑器的切换事件，当用户通过Cmd+Click跳转到依赖包源码时，自动在依赖树中定位到对应的文件节点。这是实现"无缝跳转体验"的核心模块。

### 1.2 核心功能
- **编辑器事件监听**：监听`onDidChangeActiveTextEditor`事件
- **依赖文件识别**：判断当前文件是否为依赖包源码
- **树节点定位**：自动展开并选中对应的文件节点
- **项目根目录跟踪**：支持多项目工作区的精确定位
- **Lazy Mode触发**：在懒加载模式下动态添加依赖包
- **只读标记**：自动标记依赖文件为只读状态

## 2. 技术架构

### 2.1 类结构设计

```typescript
export class EditorTracker {
  private disposables: vscode.Disposable[] = [];
  private outputChannel: vscode.OutputChannel;
  private lastProjectRoot: string | undefined;
  private gorootSrc: string | undefined;
  private pendingReveal = false;

  constructor(
    private treeView: vscode.TreeView<TreeNode>,
    private treeProvider: DependencyTreeProvider,
  ) {}
}
```

### 2.2 依赖关系
- **输入依赖**：`vscode.TreeView<TreeNode>`、`DependencyTreeProvider`
- **系统依赖**：VSCode事件系统、文件系统API
- **工具依赖**：go命令行工具（获取GOROOT）

## 3. 核心实现逻辑

### 3.1 初始化与事件绑定

```typescript
constructor(
  private treeView: vscode.TreeView<TreeNode>,
  private treeProvider: DependencyTreeProvider,
) {
  this.outputChannel = vscode.window.createOutputChannel('Go Deps Explorer');
  
  // 监听编辑器切换
  this.disposables.push(vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) { 
      this.onEditorChanged(editor); 
    }
  }));

  // 监听树视图可见性变化（v0.2.0 新增）
  this.disposables.push(treeView.onDidChangeVisibility(e => {
    if (e.visible) {
      this.outputChannel.appendLine('Tree view became visible, checking current editor');
      const editor = vscode.window.activeTextEditor;
      if (editor) { 
        this.onEditorChanged(editor); 
      }
    }
  }));

  // 缓存GOROOT路径
  this.initGoroot();

  // 启动时检查当前编辑器（延迟执行）
  setTimeout(() => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.outputChannel.appendLine('Checking active editor on startup');
      this.onEditorChanged(editor);
    }
  }, 1000);
}
```

### 3.2 GOROOT 路径缓存

```typescript
private initGoroot(): void {
  exec('go env GOROOT', (error, stdout) => {
    if (!error && stdout.trim()) {
      this.gorootSrc = path.join(stdout.trim(), 'src');
      this.outputChannel.appendLine(`GOROOT/src: ${this.gorootSrc}`);
    } else {
      // 降级策略
      const goroot = process.env.GOROOT;
      if (goroot) {
        this.gorootSrc = path.join(goroot, 'src');
      } else {
        // 尝试常见路径
        const candidates = ['/usr/local/go/src', '/usr/lib/go/src'];
        const fs = require('fs');
        for (const p of candidates) {
          if (fs.existsSync(p)) { 
            this.gorootSrc = p; 
            break; 
          }
        }
      }
      
      if (this.gorootSrc) {
        this.outputChannel.appendLine(`GOROOT/src (fallback): ${this.gorootSrc}`);
      }
    }
  });
}
```

### 3.3 编辑器切换处理

```typescript
private async onEditorChanged(editor: vscode.TextEditor): Promise<void> {
  const filePath = editor.document.uri.fsPath;
  this.outputChannel.appendLine(`Editor changed: ${filePath}`);
  
  // 跟踪项目根目录（从非依赖文件中记住）
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  if (workspaceFolder) {
    this.lastProjectRoot = workspaceFolder.uri.fsPath;
  }

  // 判断是否为依赖文件
  if (this.isDependencyFile(filePath)) {
    // v0.2.5 新增：立即标记为只读
    try {
      await vscode.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession');
    } catch (error) {
      this.outputChannel.appendLine(`Failed to set readonly for jumped file: ${error}`);
    }
    
    // 查找对应的依赖节点
    const result = this.treeProvider.findNodeForFile(filePath, this.lastProjectRoot);
    
    if (result?.depNode) {
      // Lazy Mode：触发依赖包显示
      this.treeProvider.revealDep(
        this.resolveProjectRoot(result.depNode), 
        result.depNode.dep
      );
      
      // 精确定位到文件节点
      if (result?.fileNode) {
        await this.revealNode(result.fileNode);
      }
    }
  }
}
```

### 3.4 依赖文件识别

```typescript
private isDependencyFile(filePath: string): boolean {
  const gopath = getGopath();
  const modCachePath = path.join(gopath, 'pkg', 'mod');
  
  // 检查模块缓存路径
  if (filePath.startsWith(modCachePath)) {
    return true;
  }
  
  // 检查vendor路径
  if (filePath.includes('/vendor/')) {
    return true;
  }
  
  // v0.1.11 修复：使用缓存的gorootSrc同步检查标准库路径
  if (this.gorootSrc && filePath.startsWith(this.gorootSrc)) {
    return true;
  }
  
  return false;
}
```

**识别策略**：
1. **模块缓存**：`$GOPATH/pkg/mod/`路径下的文件
2. **Vendor目录**：包含`/vendor/`的文件路径
3. **标准库**：`$GOROOT/src/`路径下的文件

### 3.5 树节点定位

```typescript
private async revealNode(node: TreeNode): Promise<void> {
  try {
    // 只有当树视图可见时才执行reveal
    if (!this.treeView.visible) {
      this.outputChannel.appendLine('Tree view not visible, skipping reveal');
      return;
    }
    
    // 防抖机制：避免频繁reveal
    if (this.pendingReveal) {
      this.outputChannel.appendLine('Reveal already pending, skipping');
      return;
    }
    
    this.pendingReveal = true;
    
    await this.treeView.reveal(node, { 
      select: true,     // 选中节点
      focus: false,     // 不抢夺焦点
      expand: false     // 不强制展开（让TreeProvider决定）
    });
    
    this.outputChannel.appendLine(`Successfully revealed node: ${node.id}`);
  } catch (error) {
    this.outputChannel.appendLine(`Failed to reveal node: ${error}`);
  } finally {
    this.pendingReveal = false;
  }
}
```

### 3.6 项目根目录解析

```typescript
private resolveProjectRoot(node: DependencyNode): string {
  // 从依赖节点的父链中找到项目根目录
  let current: TreeNode | undefined = node;
  while (current) {
    if (current.type === NodeType.Project) {
      return (current as ProjectNode).projectRoot;
    }
    if (current.type === NodeType.Category) {
      return (current as CategoryNode).projectRoot;
    }
    current = current.parent;
  }
  
  throw new Error('Cannot resolve project root from dependency node');
}
```

## 4. 多项目工作区支持

### 4.1 项目根目录跟踪

```typescript
private lastProjectRoot: string | undefined;

// 在onEditorChanged中更新
const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
if (workspaceFolder) {
  this.lastProjectRoot = workspaceFolder.uri.fsPath;
}
```

**跟踪策略**：
- 从用户当前编辑的**非依赖文件**中记录项目根目录
- 依赖文件通常位于`$GOPATH/pkg/mod`，不属于任何工作区文件夹
- 通过`lastProjectRoot`为依赖定位提供项目上下文

### 4.2 精确匹配机制

```typescript
// 调用findNodeForFile时传入preferredProjectRoot
const result = this.treeProvider.findNodeForFile(filePath, this.lastProjectRoot);
```

这确保在多项目工作区中，依赖定位到正确的项目分支下。

## 5. Lazy Mode 集成

### 5.1 触发依赖显示

```typescript
if (result?.depNode) {
  // 触发Lazy Mode依赖包显示
  this.treeProvider.revealDep(
    this.resolveProjectRoot(result.depNode), 
    result.depNode.dep
  );
}
```

### 5.2 渐进式体验

Lazy Mode下的用户体验流程：
1. 初始状态：依赖树为空
2. 用户Cmd+Click跳转到某个依赖包
3. EditorTracker检测到依赖文件，调用`revealDep()`
4. 该依赖包出现在树中并自动定位
5. 用户继续跳转，依赖树逐步完善

## 6. 只读文件处理（v0.2.5）

### 6.1 问题背景
- v0.1.20之前：使用自定义URI scheme，所有依赖文件自动只读
- v0.1.20之后：改用原生file:// URI，支持gopls跳转，但失去只读特性
- v0.2.4：恢复只读行为，但仅对通过树点击的文件有效
- v0.2.5：修复Cmd+Click跳转的文件也标记只读

### 6.2 解决方案

```typescript
// 在识别为依赖文件后立即标记只读
if (this.isDependencyFile(filePath)) {
  // v0.2.5 新增：Cmd+Click跳转的文件立即标记只读
  try {
    await vscode.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession');
  } catch (error) {
    this.outputChannel.appendLine(`Failed to set readonly for jumped file: ${error}`);
  }
  
  // 后续的树定位逻辑...
}
```

**执行时机**：
- 在依赖树定位之前执行，确保用户看到的文件已经是只读状态
- 使用try/catch包裹，兼容旧版本VSCode

## 7. 性能优化

### 7.1 事件防抖

```typescript
private pendingReveal = false;

private async revealNode(node: TreeNode): Promise<void> {
  if (this.pendingReveal) {
    this.outputChannel.appendLine('Reveal already pending, skipping');
    return;
  }
  
  this.pendingReveal = true;
  try {
    await this.treeView.reveal(node, { select: true, focus: false, expand: false });
  } finally {
    this.pendingReveal = false;
  }
}
```

### 7.2 路径缓存

- `gorootSrc`：缓存`$GOROOT/src`路径，避免重复执行`go env GOROOT`
- `lastProjectRoot`：缓存最后访问的项目根目录

### 7.3 条件执行

```typescript
// 只有当树视图可见时才执行reveal
if (!this.treeView.visible) {
  this.outputChannel.appendLine('Tree view not visible, skipping reveal');
  return;
}
```

避免在树视图不可见时执行无效的定位操作。

## 8. 错误处理

### 8.1 命令执行异常

```typescript
try {
  await vscode.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession');
} catch (error) {
  this.outputChannel.appendLine(`Failed to set readonly for jumped file: ${error}`);
}
```

### 8.2 reveal 失败处理

```typescript
try {
  await this.treeView.reveal(node, { select: true, focus: false, expand: false });
  this.outputChannel.appendLine(`Successfully revealed node: ${node.id}`);
} catch (error) {
  this.outputChannel.appendLine(`Failed to reveal node: ${error}`);
}
```

### 8.3 路径解析异常

对于无法解析项目根目录的情况，抛出明确的错误信息。

## 9. 资源管理

### 9.1 事件订阅清理

```typescript
dispose(): void {
  this.disposables.forEach(d => d.dispose());
}
```

### 9.2 内存泄漏防护

- 所有事件监听器都推入`disposables`数组
- 在扩展停用时统一清理
- 避免长期持有大对象引用

## 10. 调试支持

### 10.1 日志输出

```typescript
private outputChannel: vscode.OutputChannel;

// 详细的执行日志
this.outputChannel.appendLine(`Editor changed: ${filePath}`);
this.outputChannel.appendLine('Tree view became visible, checking current editor');
this.outputChannel.appendLine(`Successfully revealed node: ${node.id}`);
```

### 10.2 状态跟踪

通过日志记录关键状态变化：
- 编辑器切换
- 项目根目录变化  
- 依赖文件识别结果
- 树节点定位结果

便于问题诊断和功能验证。