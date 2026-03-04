import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigManager } from './configManager';
import { GoModParser } from './goModParser';
import { DependencyTreeProvider } from './dependencyTreeProvider';
import { ReadonlyFileViewer } from './readonlyFileViewer';
import { EditorTracker } from './editorTracker';
import { GoModWatcher } from './goModWatcher';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Find all projects with go.mod
  const projectRoots = findGoProjects();
  if (projectRoots.length === 0) { return; }

  // Set context for "when" clause
  vscode.commands.executeCommand('setContext', 'goDepsExplorer.hasGoMod', true);

  // Initialize core components
  const config = new ConfigManager();
  const parser = new GoModParser(config);
  const treeProvider = new DependencyTreeProvider(parser, config);

  // Initialize dependencies
  await treeProvider.initialize(projectRoots);

  // Create TreeView
  const treeView = vscode.window.createTreeView('goDepsExplorer', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
    canSelectMany: false,
  });
  context.subscriptions.push(treeView);

  // Register readonly file viewer
  const fileViewer = new ReadonlyFileViewer();
  fileViewer.register(context);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('goDepsExplorer.refresh', () => {
      treeProvider.refresh();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('goDepsExplorer.openFile', (fsPath: string) => {
      if (fsPath) { fileViewer.openFile(fsPath); }
    }),
  );

  // Editor tracker (jump-to-dependency feature)
  const tracker = new EditorTracker(treeView, treeProvider);
  context.subscriptions.push({ dispose: () => tracker.dispose() });

  // Go.mod file watcher
  const watcher = new GoModWatcher(treeProvider);
  context.subscriptions.push({ dispose: () => watcher.dispose() });

  // Config change listener
  const configDisposable = config.onConfigChange(() => {
    treeProvider.refresh();
  });
  context.subscriptions.push(configDisposable);

  console.log('Go Deps Explorer activated');
}

export function deactivate(): void {
  console.log('Go Deps Explorer deactivated');
}

function findGoProjects(): { root: string; name: string }[] {
  const projects: { root: string; name: string }[] = [];
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) { return projects; }

  for (const folder of folders) {
    const goModPath = path.join(folder.uri.fsPath, 'go.mod');
    if (fs.existsSync(goModPath)) {
      projects.push({ root: folder.uri.fsPath, name: folder.name });
    }
    // Also check immediate subdirectories for mono-repo setups
    try {
      const entries = fs.readdirSync(folder.uri.fsPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const subGoMod = path.join(folder.uri.fsPath, entry.name, 'go.mod');
          if (fs.existsSync(subGoMod)) {
            projects.push({ root: path.join(folder.uri.fsPath, entry.name), name: `${folder.name}/${entry.name}` });
          }
        }
      }
    } catch {
      // ignore read errors
    }
  }

  // Deduplicate by root path, preserving order
  const seen = new Set<string>();
  return projects.filter(p => {
    if (seen.has(p.root)) { return false; }
    seen.add(p.root);
    return true;
  });
}
