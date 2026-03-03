import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { DependencyInfo } from './models';
import { ConfigManager } from './configManager';
import { getGopath } from './utils';

export class GoModParser {
  constructor(private config: ConfigManager) {}

  async parseDependencies(projectRoot: string): Promise<DependencyInfo[]> {
    const deps = await this.runGoList(projectRoot);
    return deps;
  }

  private runGoList(cwd: string): Promise<DependencyInfo[]> {
    return new Promise((resolve, reject) => {
      exec('go list -m -json all', { cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, _stderr) => {
        if (error) {
          // Fallback: try parsing go.mod directly
          console.warn(`go list failed: ${error.message}, trying go.mod parse fallback`);
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
    const requireRegex = /^\s+([\w./\-@]+)\s+(v[\w.\-+]+)(\s*\/\/\s*indirect)?/gm;
    let match: RegExpExecArray | null;
    while ((match = requireRegex.exec(content)) !== null) {
      deps.push({
        path: match[1],
        version: match[2],
        indirect: !!match[3],
      });
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
