import * as path from 'path';
import { DependencyInfo } from './models';

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

/** Extract module path and version from a GOPATH mod cache file path */
export function extractModuleFromPath(filePath: string, gopath: string): { modulePath: string; version: string } | null {
  const modCache = path.join(gopath, 'pkg', 'mod') + path.sep;

  if (!filePath.startsWith(modCache)) { return null; }

  const relative = filePath.slice(modCache.length);
  // Find @version: the path is like github.com/user/repo@v1.0.0/file.go
  // But module paths can have multiple segments, @ only appears before version
  const atIdx = relative.indexOf('@');
  if (atIdx <= 0) { return null; }

  const modulePath = relative.slice(0, atIdx);
  const afterAt = relative.slice(atIdx + 1);
  const sepIdx = afterAt.indexOf(path.sep);
  const version = sepIdx > 0 ? afterAt.slice(0, sepIdx) : afterAt;

  return { modulePath, version };
}

export function isStandardLibraryPackage(packagePath: string): boolean {
  // Skip internal and local packages
  if (packagePath.startsWith('./') || packagePath.startsWith('../')) {
    return false;
  }
  
  // Well-known standard library packages
  const stdlibPrefixes = [
    'archive/',
    'bufio',
    'builtin', 
    'bytes',
    'compress/',
    'container/',
    'context',
    'crypto/',
    'database/',
    'debug/',
    'embed',
    'encoding/',
    'errors',
    'expvar',
    'fmt',
    'go/',
    'hash/',
    'html/',
    'image/',
    'index/',
    'io/',
    'io',
    'log/',
    'log',
    'math/',
    'math',
    'mime/',
    'mime',
    'net/',
    'net',
    'os/',
    'os',
    'path/',
    'path',
    'plugin',
    'reflect',
    'regexp',
    'runtime/',
    'runtime',
    'sort',
    'strconv',
    'strings',
    'sync/',
    'sync',
    'syscall',
    'testing/',
    'testing',
    'text/',
    'time/',
    'time',
    'unicode/',
    'unicode',
    'unsafe'
  ];
  
  // Check if package matches any standard library pattern
  for (const prefix of stdlibPrefixes) {
    if (packagePath === prefix.replace('/', '') || packagePath.startsWith(prefix)) {
      return true;
    }
  }
  
  // Also check if package name doesn't contain dots (simple heuristic)
  return !packagePath.includes('.') && !packagePath.includes('/');
}

/** Extract dependencies from go.mod text using regex */
export function parseGoModText(content: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  const lines = content.split('\n');
  let insideRequireBlock = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check for require block start
    if (line.startsWith('require (')) {
      insideRequireBlock = true;
      continue;
    }
    
    // Check for require block end
    if (insideRequireBlock && line === ')') {
      insideRequireBlock = false;
      continue;
    }
    
    // Parse dependency line inside block
    if (insideRequireBlock) {
      const match = line.match(/^\s*([^\s]+)\s+([^\s]+)(?:\s*\/\/.*)?$/);
      if (match) {
        deps.push({
          path: match[1],
          version: match[2],
          indirect: line.includes('// indirect')
        });
      }
      continue;
    }
    
    // Parse single line require
    const singleMatch = line.match(/^require\s+([^\s]+)\s+([^\s]+)(?:\s*\/\/.*)?$/);
    if (singleMatch) {
      deps.push({
        path: singleMatch[1],
        version: singleMatch[2],
        indirect: line.includes('// indirect')
      });
    }
  }
  
  return deps;
}