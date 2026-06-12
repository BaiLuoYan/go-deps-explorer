import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { DependencyTreeProvider } from './dependencyTreeProvider';
import { TreeNode, DependencyInfo } from './models';
import { getGopath } from './utils';

export class EditorTracker {
  private disposables: vscode.Disposable[] = [];
  private outputChannel: vscode.OutputChannel;
  private lastProjectRoot: string | undefined;
  private gorootSrc: string | undefined;
  private revealVersion = 0;

  // All known sub-project roots, sorted longest-first for prefix matching
  private projectRoots: string[] = [];

  constructor(
    private treeView: vscode.TreeView<TreeNode>,
    private treeProvider: DependencyTreeProvider,
    knownProjectRoots: string[],
    outputChannel: vscode.OutputChannel,
  ) {
    this.projectRoots = [...knownProjectRoots].sort((a, b) => b.length - a.length);
    this.outputChannel = outputChannel;

    // Listen for editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.onEditorChanged(editor);
        }
      }),
    );

    // Listen for tree view visibility changes
    this.disposables.push(
      treeView.onDidChangeVisibility((e) => {
        if (e.visible) {
          this.outputChannel.appendLine('Tree view became visible, checking current editor');
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            this.onEditorChanged(editor);
          }
        }
      }),
    );

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

  private async onEditorChanged(editor: vscode.TextEditor): Promise<void> {
    const filePath = editor.document.uri.fsPath;
    this.outputChannel.appendLine(`[EditorChanged] ${filePath}`);

    // Only update lastProjectRoot when the active file belongs to a known project
    // (i.e. not a dependency file from GOPATH/pkg/mod or GOROOT/src)
    if (!this.isDependencyFile(filePath)) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      if (workspaceFolder) {
        const matchedRoot = this.projectRoots.find(r => filePath.startsWith(r + path.sep) || filePath === r);
        this.lastProjectRoot = matchedRoot || workspaceFolder.uri.fsPath;
        this.outputChannel.appendLine(`[ProjectRoot] ${this.lastProjectRoot}`);
      }
      return;
    }

    // Increment version to cancel any pending reveal from a previous call
    const myVersion = ++this.revealVersion;

    // Mark dependency files as read-only (covers Cmd+Click jumps via gopls)
    try {
      await vscode.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession');
    } catch {
      // VS Code < 1.79: silently ignore
    }

    // If another onEditorChanged fired while we awaited, abort this one
    if (myVersion !== this.revealVersion) {
      this.outputChannel.appendLine('[Reveal] Cancelled (superseded)');
      return;
    }

    this.outputChannel.appendLine(`[Reveal] preferredRoot=${this.lastProjectRoot || 'none'}`);

    let result = this.treeProvider.findNodeForFile(filePath, this.lastProjectRoot);

    // If not found (or found under wrong project) and file is under GOROOT/src,
    // dynamically add the stdlib package to the preferred project
    const needsStdlibAdd = this.gorootSrc && filePath.startsWith(this.gorootSrc + path.sep) && this.lastProjectRoot && (
      !result?.depNode || result.depNode.parent.projectRoot !== this.lastProjectRoot
    );

    if (needsStdlibAdd) {
      const relativePath = path.relative(this.gorootSrc!, filePath);
      const segments = relativePath.split(path.sep);
      let pkgPath = '';
      for (let i = 0; i < segments.length - 1; i++) {
        pkgPath = pkgPath ? pkgPath + '/' + segments[i] : segments[i];
      }
      if (pkgPath) {
        const pkgDir = path.join(this.gorootSrc!, pkgPath);
        const dep: DependencyInfo = {
          path: pkgPath,
          version: 'stdlib',
          indirect: false,
          dir: pkgDir,
        };
        this.treeProvider.addStdlibDep(this.lastProjectRoot!, dep);
        this.outputChannel.appendLine(`[Reveal] Added stdlib dep: ${pkgPath} for ${this.lastProjectRoot}`);
        result = this.treeProvider.findNodeForFile(filePath, this.lastProjectRoot);
      }
    }

    if (!result?.depNode) {
      this.outputChannel.appendLine('[Reveal] No dep node found');
      return;
    }

    const depProjectRoot = result.depNode.parent.projectRoot;
    this.outputChannel.appendLine(`[Reveal] Found dep=${result.depNode.dep.path} project=${depProjectRoot}`);

    // In lazy mode, ensure this dep is added to the revealed set
    // revealDep fires _onDidChangeTreeData which may cause a tree refresh
    const treeChanged = this.treeProvider.revealDep(depProjectRoot, result.depNode.dep);

    // Only reveal if the tree view is currently visible
    if (!this.treeView.visible) {
      this.outputChannel.appendLine('[Reveal] Tree not visible, skipping');
      return;
    }

    // If the tree was refreshed (lazy mode added new dep), wait for VSCode to process it
    if (treeChanged) {
      await new Promise(resolve => setTimeout(resolve, 50));
      if (myVersion !== this.revealVersion) {
        this.outputChannel.appendLine('[Reveal] Cancelled after tree refresh (superseded)');
        return;
      }
    }

    try {
      if (result.fileNode) {
        await this.treeView.reveal(result.fileNode, {
          select: true,
          focus: false,
          expand: false,
        });
        this.outputChannel.appendLine(`[Reveal] OK file=${result.fileNode.id}`);
      } else {
        await this.treeView.reveal(result.depNode, {
          select: true,
          focus: false,
          expand: 1,
        });
        this.outputChannel.appendLine(`[Reveal] OK dep=${result.depNode.id}`);
      }
    } catch (e) {
      this.outputChannel.appendLine(`[Reveal] FAILED: ${e}`);
    }
  }

  private isDependencyFile(filePath: string): boolean {
    const gopath = getGopath();
    const modCachePath = path.join(gopath, 'pkg', 'mod');

    if (filePath.startsWith(modCachePath)) {
      return true;
    }

    // Check vendor directories
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        const vendorDir = path.join(folder.uri.fsPath, 'vendor');
        if (filePath.startsWith(vendorDir)) {
          return true;
        }
      }
    }

    // Check GOROOT/src for standard library files
    if (this.gorootSrc && filePath.startsWith(this.gorootSrc)) {
      return true;
    }

    return false;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.outputChannel.dispose();
  }
}
