import * as vscode from 'vscode';
import { DependencyTreeProvider } from './dependencyTreeProvider';

export class GoModWatcher {
  private watcher: vscode.FileSystemWatcher;
  private debounceTimer?: ReturnType<typeof setTimeout>;

  constructor(private treeProvider: DependencyTreeProvider) {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/go.mod');
    this.watcher.onDidChange(() => this.debouncedRefresh());
    this.watcher.onDidCreate(() => this.debouncedRefresh());
    this.watcher.onDidDelete(() => this.debouncedRefresh());
  }

  private debouncedRefresh(): void {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
    this.debounceTimer = setTimeout(() => {
      this.treeProvider.refresh();
    }, 1000);
  }

  dispose(): void {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
    this.watcher.dispose();
  }
}
