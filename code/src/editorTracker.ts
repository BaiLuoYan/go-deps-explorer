import * as vscode from 'vscode';
import * as path from 'path';
import { DependencyTreeProvider } from './dependencyTreeProvider';
import { TreeNode } from './models';
import { getGopath } from './utils';

export class EditorTracker {
  private disposable: vscode.Disposable;
  private outputChannel: vscode.OutputChannel;

  constructor(
    private treeView: vscode.TreeView<TreeNode>,
    private treeProvider: DependencyTreeProvider,
  ) {
    this.outputChannel = vscode.window.createOutputChannel('Go Dependencies Explorer');
    this.disposable = vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) { this.onEditorChanged(editor); }
    });
  }

  private async onEditorChanged(editor: vscode.TextEditor): Promise<void> {
    const filePath = editor.document.uri.fsPath;
    this.outputChannel.appendLine(`Editor changed: ${filePath}`);
    
    if (!this.isDependencyFile(filePath)) { 
      this.outputChannel.appendLine('Not a dependency file, skipping');
      return; 
    }

    const result = this.treeProvider.findNodeForFile(filePath);
    if (!result?.depNode) { 
      this.outputChannel.appendLine('No dependency node found for file');
      return; 
    }

    this.outputChannel.appendLine(`Found dependency node: ${result.depNode.label}`);

    try {
      // 直接 reveal 依赖节点，让 VSCode 处理展开
      await this.treeView.reveal(result.depNode, {
        select: true,
        focus: false,
        expand: 3, // 展开到文件层级
      });
      this.outputChannel.appendLine('Successfully revealed dependency node');
    } catch (e) {
      this.outputChannel.appendLine(`Reveal failed: ${e}`);
    }
  }

  private isDependencyFile(filePath: string): boolean {
    const gopath = getGopath();
    const modCachePath = path.join(gopath, 'pkg', 'mod');

    if (filePath.startsWith(modCachePath)) { return true; }

    // Check vendor directories
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        const vendorDir = path.join(folder.uri.fsPath, 'vendor');
        if (filePath.startsWith(vendorDir)) { return true; }
      }
    }

    return false;
  }

  dispose(): void {
    this.disposable.dispose();
    this.outputChannel.dispose();
  }
}

/** Extract module path and version from a GOPATH mod cache file path */
export function extractModuleFromPath(filePath: string): { modulePath: string; version: string } | null {
  const gopath = getGopath();
  const modCache = path.join(gopath, 'pkg', 'mod') + path.sep;

  if (!filePath.startsWith(modCache)) { return null; }

  const relative = filePath.slice(modCache.length);
  // Find @version: the path is like github.com/user/repo@v1.0.0/file.go
  // But module paths can have multiple segments, @ only appears before version
  const atIdx = relative.indexOf('@');
  if (atIdx <= 0) { return null; }

  const modulePath = relative.slice(0, atIdx);
  const afterAt = relative.slice(atIdx + 1);
  const sepIdx = afterAt.indexOf(path.sep);
  const version = sepIdx > 0 ? afterAt.slice(0, sepIdx) : afterAt;

  return { modulePath, version };
}
