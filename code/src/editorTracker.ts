import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { DependencyTreeProvider } from './dependencyTreeProvider';
import { TreeNode, FileNode } from './models';
import { getGopath } from './utils';
import { extractModuleFromPath } from './pure';

export class EditorTracker {
  private disposables: vscode.Disposable[] = [];
  private outputChannel: vscode.OutputChannel;
  private lastProjectRoot: string | undefined;
  private gorootSrc: string | undefined;
  private pendingReveal = false;

  constructor(
    private treeView: vscode.TreeView<TreeNode>,
    private treeProvider: DependencyTreeProvider,
  ) {
    this.outputChannel = vscode.window.createOutputChannel('Go Deps Explorer');
    
    // Listen for editor changes
    this.disposables.push(vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) { this.onEditorChanged(editor); }
    }));

    // Listen for tree view visibility changes
    this.disposables.push(treeView.onDidChangeVisibility(e => {
      if (e.visible) {
        this.outputChannel.appendLine('Tree view became visible, checking current editor');
        const editor = vscode.window.activeTextEditor;
        if (editor) { this.onEditorChanged(editor); }
      }
    }));

    // Cache GOROOT on init
    this.initGoroot();

    // Check current active editor on startup (after a short delay for tree to initialize)
    setTimeout(() => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        this.outputChannel.appendLine('Checking active editor on startup');
        this.onEditorChanged(editor);
      }
    }, 1000);
  }

  private initGoroot(): void {
    exec('go env GOROOT', (error, stdout) => {
      if (!error && stdout.trim()) {
        this.gorootSrc = path.join(stdout.trim(), 'src');
        this.outputChannel.appendLine(`GOROOT/src: ${this.gorootSrc}`);
      } else {
        // Fallback
        const goroot = process.env.GOROOT;
        if (goroot) {
          this.gorootSrc = path.join(goroot, 'src');
        } else {
          // Common paths
          const candidates = ['/usr/local/go/src', '/usr/lib/go/src'];
          const fs = require('fs');
          for (const p of candidates) {
            if (fs.existsSync(p)) { this.gorootSrc = p; break; }
          }
        }
        if (this.gorootSrc) {
          this.outputChannel.appendLine(`GOROOT/src (fallback): ${this.gorootSrc}`);
        }
      }
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

    let result = this.treeProvider.findNodeForFile(filePath, this.lastProjectRoot);
    
    // If not found and file is under GOROOT/src, dynamically add the stdlib package
    if (!result?.depNode && this.gorootSrc && filePath.startsWith(this.gorootSrc + path.sep)) {
      const relativePath = path.relative(this.gorootSrc, filePath);
      const segments = relativePath.split(path.sep);
      // Find the package path — could be multi-level like "net/http" or single like "fmt"
      // Walk up from file to find a directory that contains .go files at the expected package level
      let pkgPath = '';
      for (let i = 0; i < segments.length - 1; i++) {
        pkgPath = pkgPath ? pkgPath + '/' + segments[i] : segments[i];
      }
      if (pkgPath) {
        const pkgDir = path.join(this.gorootSrc, pkgPath);
        const dep: any = { path: pkgPath, version: 'stdlib', indirect: false, dir: pkgDir };
        // Add to all projects (or preferred project)
        const targetRoot = this.lastProjectRoot || Array.from(this.treeProvider['projects'].keys())[0];
        if (targetRoot) {
          this.treeProvider.addStdlibDep(targetRoot, dep);
          this.outputChannel.appendLine(`Dynamically added stdlib dep: ${pkgPath} for ${targetRoot}`);
          // Re-search after adding
          result = this.treeProvider.findNodeForFile(filePath, this.lastProjectRoot);
        }
      }
    }
    
    if (!result?.depNode) { 
      this.outputChannel.appendLine('No dependency node found for file');
      return; 
    }

    // In lazy mode, ensure this dep is added to the revealed set
    this.treeProvider.revealDep(
      result.depNode.parent.projectRoot,
      result.depNode.dep,
    );

    this.outputChannel.appendLine(`Found dependency node: ${result.depNode.label}`);

    // Only reveal if the tree view is currently visible (don't force open the Explorer panel)
    if (!this.treeView.visible) {
      this.outputChannel.appendLine('Tree view not visible, skipping reveal');
      return;
    }

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
    if (this.gorootSrc && filePath.startsWith(this.gorootSrc)) {
      return true;
    }

    return false;
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.outputChannel.dispose();
  }
}
