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
  treeProvider.setWorkspaceState(context.workspaceState);
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
  const tracker = new EditorTracker(treeView, treeProvider, projectRoots.map(p => p.root));
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
    scanForGoProjects(folder.uri.fsPath, folder.uri.fsPath, folder.name, projects, 0);
  }

  // Deduplicate by root path, preserving order
  const seen = new Set<string>();
  return projects.filter(p => {
    if (seen.has(p.root)) { return false; }
    seen.add(p.root);
    return true;
  });
}

function scanForGoProjects(
  dir: string,
  workspaceRoot: string,
  workspaceName: string,
  results: { root: string; name: string }[],
  depth: number,
  maxDepth = 4,
): void {
  if (depth > maxDepth) { return; }

  const goModPath = path.join(dir, 'go.mod');
  if (fs.existsSync(goModPath)) {
    const relative = path.relative(workspaceRoot, dir);
    const name = relative ? `${workspaceName}/${relative}` : workspaceName;
    results.push({ root: dir, name });
    // Don't descend into a Go module — nested modules are unusual and expensive
    return;
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'vendor' || entry.name === 'node_modules') {
        continue;
      }
      scanForGoProjects(path.join(dir, entry.name), workspaceRoot, workspaceName, results, depth + 1, maxDepth);
    }
  } catch {
    // ignore read errors
  }
}
