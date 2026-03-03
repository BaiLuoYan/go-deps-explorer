import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { exec } from 'child_process';
import { DependencyInfo } from './models';
import { ConfigManager } from './configManager';
import { getGopath } from './utils';
import { parseJsonStream, isStandardLibraryPackage, parseGoModText } from './pure';

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
    return parseGoModText(content);
  }

  getSourcePath(dep: DependencyInfo, projectRoot: string): string {
    const useReplace = this.config.handleReplace && dep.replace;
    const effectiveDep = useReplace ? dep.replace! : dep;

    // Vendor first
    if (this.config.vendorFirst) {
      const vendorPath = path.join(projectRoot, 'vendor', effectiveDep.path);
      if (fs.existsSync(vendorPath)) { return vendorPath; }
    }

    // When handleReplace=false but dep has replace, dep.dir points to replaced location
    // In that case, skip dep.dir and use GOPATH fallback for original module
    if (!useReplace && dep.replace && effectiveDep.dir) {
      // dep.dir is tainted by replace, use GOPATH for original path@version
      const gopath = getGopath();
      const originalPath = path.join(gopath, 'pkg', 'mod', `${dep.path}@${dep.version}`);
      if (fs.existsSync(originalPath)) { return originalPath; }
      // If original doesn't exist in cache, fall through to dep.dir anyway
    }

    // go list returned dir
    if (effectiveDep.dir) { return effectiveDep.dir; }

    // Fallback: GOPATH
    const gopath = getGopath();
    return path.join(gopath, 'pkg', 'mod', `${effectiveDep.path}@${effectiveDep.version}`);
  }

  async parseStdlibDeps(projectRoot: string): Promise<DependencyInfo[]> {
    return new Promise((resolve, reject) => {
      // First get GOROOT
      exec('go env GOROOT', { cwd: projectRoot }, (error, goroot, _stderr) => {
        if (error) {
          outputChannel.appendLine(`[WARN] Failed to get GOROOT: ${error.message}`);
          resolve([]);
          return;
        }
        
        const gorootPath = goroot.trim();
        
        // Then get project imports
        exec('go list -json ./...', { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, _stderr) => {
          if (error) {
            outputChannel.appendLine(`[WARN] Failed to get project imports: ${error.message}`);
            resolve([]);
            return;
          }
          
          try {
            const packages = parseJsonStream(stdout);
            const stdlibImports = new Set<string>();
            
            // Extract all imports from all packages (including test imports and transitive deps)
            for (const pkg of packages) {
              const allImports = [
                ...(pkg.Imports || []),
                ...(pkg.TestImports || []),
                ...(pkg.XTestImports || []),
                ...(pkg.Deps || []),
              ];
              for (const imp of allImports) {
                if (isStandardLibraryPackage(imp)) {
                  stdlibImports.add(imp);
                }
              }
            }
            
            // Convert to DependencyInfo format
            const stdlibDeps: DependencyInfo[] = [];
            for (const pkgName of Array.from(stdlibImports).sort()) {
              const stdlibDir = path.join(gorootPath, 'src', pkgName);
              stdlibDeps.push({
                path: pkgName,
                version: 'stdlib',
                indirect: false,
                dir: stdlibDir,
              });
            }
            
            outputChannel.appendLine(`[${projectRoot}] Found ${stdlibDeps.length} standard library packages`);
            resolve(stdlibDeps);
          } catch (e) {
            outputChannel.appendLine(`[ERROR] Failed to parse stdlib deps: ${e}`);
            resolve([]);
          }
        });
      });
    });
  }

  hasVendor(projectRoot: string): boolean {
    const vendorModules = path.join(projectRoot, 'vendor', 'modules.txt');
    return fs.existsSync(vendorModules);
  }
}
