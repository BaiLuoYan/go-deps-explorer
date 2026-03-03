import * as vscode from 'vscode';
import * as path from 'path';
import { DependencyTreeProvider } from './dependencyTreeProvider';
import { TreeNode, FileNode } from './models';
import { getGopath } from './utils';

export class EditorTracker {
  private disposable: vscode.Disposable;
  private outputChannel: vscode.OutputChannel;
  private lastProjectRoot: string | undefined;

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
    
    // Track the last known project root from non-dependency files
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (workspaceFolder) {
      this.lastProjectRoot = workspaceFolder.uri.fsPath;
      this.outputChannel.appendLine(`Updated lastProjectRoot: ${this.lastProjectRoot}`);
    }

    if (!this.isDependencyFile(filePath)) { 
      this.outputChannel.appendLine('Not a dependency file, skipping');
      return; 
    }

    this.outputChannel.appendLine(`Using project root: ${this.lastProjectRoot || 'none'}`);

    const result = this.treeProvider.findNodeForFile(filePath, this.lastProjectRoot);
    if (!result?.depNode) { 
      this.outputChannel.appendLine('No dependency node found for file');
      return; 
    }

    this.outputChannel.appendLine(`Found dependency node: ${result.depNode.label}`);

    try {
      if (result.fileNode) {
        // Reveal 到具体文件节点，VSCode 只展开该路径
        await this.treeView.reveal(result.fileNode, {
          select: true,
          focus: false,
          expand: false,
        });
        this.outputChannel.appendLine(`Revealed file node: ${result.fileNode.fsPath}`);
      } else if (result.depNode) {
        // 没有文件节点时，reveal 到依赖包
        await this.treeView.reveal(result.depNode, {
          select: true,
          focus: false,
          expand: 1,
        });
        this.outputChannel.appendLine('Revealed dependency node (no file node)');
      }
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

    // Check GOROOT/src for standard library files
    return new Promise((resolve) => {
      const { exec } = require('child_process');
      exec('go env GOROOT', (error: any, stdout: string, _stderr: any) => {
        if (error) {
          resolve(false);
          return;
        }
        const goroot = stdout.trim();
        const gorootSrc = path.join(goroot, 'src');
        resolve(filePath.startsWith(gorootSrc));
      });
    }) as any || false; // Fallback to synchronous check

    // Synchronous fallback - check common GOROOT locations
    const commonGorootPaths: string[] = [
      '/usr/local/go/src',
      '/usr/lib/go/src',
    ];
    
    const goroot: string | undefined = process.env.GOROOT;
    if (goroot !== undefined) {
      commonGorootPaths.push(path.join(goroot as string, 'src'));
    }

    for (const gorootSrc of commonGorootPaths) {
      if (filePath.startsWith(gorootSrc)) {
        return true;
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
