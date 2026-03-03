import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { exec } from 'child_process';
import { DependencyInfo } from './models';
import { ConfigManager } from './configManager';
import { getGopath } from './utils';

const outputChannel = vscode.window.createOutputChannel('Go Deps Explorer');

export class GoModParser {
  constructor(private config: ConfigManager) {}

  async parseDependencies(projectRoot: string): Promise<DependencyInfo[]> {
    const deps = await this.runGoList(projectRoot);
    outputChannel.appendLine(`[${projectRoot}] Loaded ${deps.length} dependencies (${deps.filter(d => !d.indirect).length} direct, ${deps.filter(d => d.indirect).length} indirect)`);
    return deps;
  }

  private runGoList(cwd: string): Promise<DependencyInfo[]> {
    return new Promise((resolve, reject) => {
      exec('go list -m -json all', { cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, _stderr) => {
        if (error) {
          // Fallback: try parsing go.mod directly
          outputChannel.appendLine(`[WARN] go list failed: ${error.message}, using go.mod fallback`);
          this.parseGoModFallback(cwd).then(resolve).catch(reject);
          return;
        }
        try {
          const modules = parseJsonStream(stdout);
          const deps: DependencyInfo[] = [];
          for (const mod of modules) {
            if (mod.Main) { continue; }
            const dep: DependencyInfo = {
              path: mod.Path,
              version: mod.Version || '',
              indirect: mod.Indirect === true,
              dir: mod.Dir,
              goVersion: mod.GoVersion,
            };
            if (mod.Replace) {
              dep.replace = {
                path: mod.Replace.Path,
                version: mod.Replace.Version,
                dir: mod.Replace.Dir,
              };
            }
            deps.push(dep);
          }
          resolve(deps);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  private async parseGoModFallback(projectRoot: string): Promise<DependencyInfo[]> {
    const goModPath = path.join(projectRoot, 'go.mod');
    if (!fs.existsSync(goModPath)) { return []; }
    const content = fs.readFileSync(goModPath, 'utf8');
    const deps: DependencyInfo[] = [];

    // Match single-line: require github.com/foo v1.0.0
    const singleRegex = /^require\s+([\w./\-@]+)\s+(v[\w.\-+]+)/gm;
    let match: RegExpExecArray | null;
    while ((match = singleRegex.exec(content)) !== null) {
      deps.push({ path: match[1], version: match[2], indirect: false });
    }

    // Match block: require ( ... )
    const blockRegex = /require\s*\(([\s\S]*?)\)/g;
    let blockMatch: RegExpExecArray | null;
    while ((blockMatch = blockRegex.exec(content)) !== null) {
      const block = blockMatch[1];
      const lineRegex = /^\s*([\w./\-@]+)\s+(v[\w.\-+]+)(\s*\/\/\s*indirect)?/gm;
      let lineMatch: RegExpExecArray | null;
      while ((lineMatch = lineRegex.exec(block)) !== null) {
        deps.push({
          path: lineMatch[1],
          version: lineMatch[2],
          indirect: !!lineMatch[3],
        });
      }
    }
    return deps;
  }

  getSourcePath(dep: DependencyInfo, projectRoot: string): string {
    const effectiveDep = (this.config.handleReplace && dep.replace) ? dep.replace : dep;

    // Vendor first
    if (this.config.vendorFirst) {
      const vendorPath = path.join(projectRoot, 'vendor', effectiveDep.path);
      if (fs.existsSync(vendorPath)) { return vendorPath; }
    }

    // go list returned dir
    if (effectiveDep.dir) { return effectiveDep.dir; }

    // Fallback: GOPATH
    const gopath = getGopath();
    return path.join(gopath, 'pkg', 'mod', `${effectiveDep.path}@${effectiveDep.version}`);
  }

  hasVendor(projectRoot: string): boolean {
    const vendorModules = path.join(projectRoot, 'vendor', 'modules.txt');
    return fs.existsSync(vendorModules);
  }
}

/** Parse a stream of JSON objects (go list output) */
export function parseJsonStream(text: string): any[] {
  const results: any[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) { start = i; }
      depth++;
    }
    if (text[i] === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        results.push(JSON.parse(text.slice(start, i + 1)));
        start = -1;
      }
    }
  }
  return results;
}
