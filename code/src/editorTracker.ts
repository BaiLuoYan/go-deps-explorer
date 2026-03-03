import * as vscode from 'vscode';
import * as path from 'path';
import { DependencyTreeProvider } from './dependencyTreeProvider';
import { TreeNode } from './models';
import { getGopath } from './utils';

export class EditorTracker {
  private disposable: vscode.Disposable;

  constructor(
    private treeView: vscode.TreeView<TreeNode>,
    private treeProvider: DependencyTreeProvider,
  ) {
    this.disposable = vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) { this.onEditorChanged(editor); }
    });
  }

  private async onEditorChanged(editor: vscode.TextEditor): Promise<void> {
    const filePath = editor.document.uri.fsPath;
    if (!this.isDependencyFile(filePath)) { return; }

    const result = this.treeProvider.findNodeForFile(filePath);
    if (!result) { return; }

    // We can't easily do deep reveal without building the full path chain.
    // Instead, reveal the dependency node itself (which is the most useful action).
    try {
      await this.treeView.reveal(result.depNode, {
        select: true,
        focus: false,
        expand: 3, // Expand up to 3 levels deep
      });
    } catch (e) {
      // reveal may fail if node not yet in tree; ignore silently
      console.debug('EditorTracker reveal failed:', e);
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
