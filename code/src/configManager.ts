import * as vscode from 'vscode';

export class ConfigManager {
  get handleReplace(): boolean {
    return vscode.workspace.getConfiguration('goDepsExplorer').get('handleReplace', true);
  }

  get showIndirect(): boolean {
    return vscode.workspace.getConfiguration('goDepsExplorer').get('showIndirect', true);
  }

  get vendorFirst(): boolean {
    return vscode.workspace.getConfiguration('goDepsExplorer').get('vendorFirst', false);
  }

  onConfigChange(callback: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('goDepsExplorer')) {
        callback();
      }
    });
  }
}
