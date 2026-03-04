import * as vscode from 'vscode';
import * as path from 'path';

export class ReadonlyFileViewer {
  constructor() {}

  register(_context: vscode.ExtensionContext): void {
    // No custom scheme needed; we open files directly via file:// URI
  }

  async openFile(fsPath: string): Promise<void> {
    const uri = vscode.Uri.file(fsPath);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: false });
    // Mark as readonly in this session (VS Code 1.79+)
    try {
      await vscode.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession');
    } catch {
      // Fallback for older VS Code versions: silently ignore
    }
  }

  dispose(): void {}
}