import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const SCHEME = 'go-dep';

class DepFileContentProvider implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(uri: vscode.Uri): string {
    const fsPath = decodeURIComponent(uri.query);
    if (!fsPath || !fs.existsSync(fsPath)) {
      return `// File not found: ${fsPath}`;
    }
    return fs.readFileSync(fsPath, 'utf8');
  }
}

export class ReadonlyFileViewer {
  private provider: DepFileContentProvider;
  private disposable: vscode.Disposable | undefined;

  constructor() {
    this.provider = new DepFileContentProvider();
  }

  register(context: vscode.ExtensionContext): void {
    this.disposable = vscode.workspace.registerTextDocumentContentProvider(SCHEME, this.provider);
    context.subscriptions.push(this.disposable);
  }

  async openFile(fsPath: string): Promise<void> {
    // Use the file's basename as the display title; store real path in query
    const fileName = path.basename(fsPath);
    const uri = vscode.Uri.parse(`${SCHEME}:${fileName}?${encodeURIComponent(fsPath)}`);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: false });
  }

  dispose(): void {
    this.disposable?.dispose();
  }
}