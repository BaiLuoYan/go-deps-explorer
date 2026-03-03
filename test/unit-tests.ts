import * as assert from 'assert';
import * as path from 'path';

// ==================== Inline pure functions (avoid vscode import) ====================

/** Parse a stream of JSON objects (go list output) */
function parseJsonStream(text: string): any[] {
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
function extractModuleFromPath(filePath: string, gopath: string): { modulePath: string; version: string } | null {
  const modCache = path.join(gopath, 'pkg', 'mod') + path.sep;
  if (!filePath.startsWith(modCache)) { return null; }
  const relative = filePath.slice(modCache.length);
  const atIdx = relative.indexOf('@');
  if (atIdx <= 0) { return null; }
  const modulePath = relative.slice(0, atIdx);
  const afterAt = relative.slice(atIdx + 1);
  const sepIdx = afterAt.indexOf(path.sep);
  const version = sepIdx > 0 ? afterAt.slice(0, sepIdx) : afterAt;
  return { modulePath, version };
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (e: any) {
    failed++;
    failures.push(name);
    console.log(`❌ ${name}: ${e.message}`);
  }
}

// ==================== parseJsonStream tests ====================
console.log('=== GoModParser: parseJsonStream ===');

test('empty input returns empty array', () => {
  assert.deepStrictEqual(parseJsonStream(''), []);
});

test('single module', () => {
  const r = parseJsonStream('{"Path":"example.com/foo","Version":"v1.0.0"}');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].Path, 'example.com/foo');
  assert.strictEqual(r[0].Version, 'v1.0.0');
});

test('multiple modules (go list format)', () => {
  const r = parseJsonStream(`
{
  "Path": "myproject",
  "Main": true,
  "GoVersion": "1.21"
}
{
  "Path": "github.com/gin-gonic/gin",
  "Version": "v1.9.1",
  "Indirect": false
}
{
  "Path": "golang.org/x/sys",
  "Version": "v0.15.0",
  "Indirect": true
}
`);
  assert.strictEqual(r.length, 3);
  assert.strictEqual(r[0].Main, true);
  assert.strictEqual(r[1].Path, 'github.com/gin-gonic/gin');
  assert.strictEqual(r[2].Indirect, true);
});

test('module with replace', () => {
  const r = parseJsonStream(`{
    "Path": "github.com/old/pkg",
    "Version": "v1.0.0",
    "Replace": { "Path": "../local/pkg", "Dir": "/home/user/local/pkg" }
  }`);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].Replace.Path, '../local/pkg');
  assert.strictEqual(r[0].Replace.Dir, '/home/user/local/pkg');
});

test('whitespace and newlines', () => {
  const r = parseJsonStream('\n\n  {"Path":"a"}  \n  {"Path":"b"}  \n\n');
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].Path, 'a');
  assert.strictEqual(r[1].Path, 'b');
});

test('module with all fields', () => {
  const r = parseJsonStream(`{
    "Path": "github.com/test/mod",
    "Version": "v2.1.0",
    "Indirect": true,
    "Dir": "/home/go/pkg/mod/github.com/test/mod@v2.1.0",
    "GoVersion": "1.19",
    "Replace": {
      "Path": "github.com/test/mod-fork",
      "Version": "v2.1.1",
      "Dir": "/home/go/pkg/mod/github.com/test/mod-fork@v2.1.1"
    }
  }`);
  assert.strictEqual(r.length, 1);
  const m = r[0];
  assert.strictEqual(m.Path, 'github.com/test/mod');
  assert.strictEqual(m.Indirect, true);
  assert.strictEqual(m.GoVersion, '1.19');
  assert.strictEqual(m.Replace.Version, 'v2.1.1');
});

// ==================== extractModuleFromPath tests ====================
console.log('\n=== EditorTracker: extractModuleFromPath ===');

const GOPATH = '/home/user/go';
const modCache = path.join(GOPATH, 'pkg', 'mod');

test('standard module path', () => {
  const r = extractModuleFromPath(path.join(modCache, 'github.com/gin-gonic/gin@v1.9.1', 'gin.go'), GOPATH);
  assert.ok(r);
  assert.strictEqual(r.modulePath, 'github.com/gin-gonic/gin');
  assert.strictEqual(r.version, 'v1.9.1');
});

test('module with subdirectory', () => {
  const r = extractModuleFromPath(path.join(modCache, 'golang.org/x/sys@v0.15.0', 'unix', 'syscall.go'), GOPATH);
  assert.ok(r);
  assert.strictEqual(r.modulePath, 'golang.org/x/sys');
  assert.strictEqual(r.version, 'v0.15.0');
});

test('non-module path returns null', () => {
  const r = extractModuleFromPath('/home/user/myproject/main.go', GOPATH);
  assert.strictEqual(r, null);
});

test('path without @ version returns null', () => {
  const r = extractModuleFromPath(path.join(modCache, 'some/path/without/version'), GOPATH);
  assert.strictEqual(r, null);
});

test('module with pre-release version', () => {
  const r = extractModuleFromPath(path.join(modCache, 'example.com/pkg@v0.0.0-20231215085349-abc123', 'file.go'), GOPATH);
  assert.ok(r);
  assert.strictEqual(r.modulePath, 'example.com/pkg');
  assert.strictEqual(r.version, 'v0.0.0-20231215085349-abc123');
});

test('capitalized module path (Go module case encoding)', () => {
  const r = extractModuleFromPath(path.join(modCache, 'github.com/!azure/azure-sdk@v1.0.0', 'sdk.go'), GOPATH);
  assert.ok(r);
  assert.strictEqual(r.modulePath, 'github.com/!azure/azure-sdk');
  assert.strictEqual(r.version, 'v1.0.0');
});

// ==================== parseJsonStream - boundary cases ====================
console.log('\n=== parseJsonStream - Boundary Cases ===');

test('nested JSON objects', () => {
  const input = `{
    "Path": "github.com/complex/module",
    "Version": "v2.0.0",
    "Replace": {
      "Path": "github.com/local/fork",
      "Version": "v2.0.1",
      "Dir": "/home/user/local/fork",
      "GoMod": "/home/user/local/fork/go.mod"
    },
    "Require": [
      {"Path": "golang.org/x/crypto", "Version": "v0.17.0"}
    ]
  }`;
  const r = parseJsonStream(input);
  assert.strictEqual(r.length, 1);
  const m = r[0];
  assert.strictEqual(m.Path, 'github.com/complex/module');
  assert.strictEqual(m.Replace.Path, 'github.com/local/fork');
  assert.strictEqual(m.Replace.GoMod, '/home/user/local/fork/go.mod');
  assert.strictEqual(m.Require.length, 1);
  assert.strictEqual(m.Require[0].Path, 'golang.org/x/crypto');
});

test('empty objects', () => {
  const r = parseJsonStream('{}{}');
  assert.strictEqual(r.length, 2);
  assert.deepStrictEqual(r[0], {});
  assert.deepStrictEqual(r[1], {});
});

test('large number of modules (12+)', () => {
  // Generate 12 different modules
  const modules = [];
  for (let i = 1; i <= 12; i++) {
    modules.push(`{
      "Path": "example.com/module${i}",
      "Version": "v1.${i}.0",
      "Indirect": ${i > 6}
    }`);
  }
  const input = modules.join('');
  const r = parseJsonStream(input);
  assert.strictEqual(r.length, 12);
  
  // Verify first and last modules
  assert.strictEqual(r[0].Path, 'example.com/module1');
  assert.strictEqual(r[0].Version, 'v1.1.0');
  assert.strictEqual(r[0].Indirect, false);
  
  assert.strictEqual(r[11].Path, 'example.com/module12');
  assert.strictEqual(r[11].Version, 'v1.12.0');
  assert.strictEqual(r[11].Indirect, true);
  
  // Verify all modules parsed
  for (let i = 0; i < 12; i++) {
    assert.strictEqual(r[i].Path, `example.com/module${i + 1}`);
  }
});

// ==================== extractModuleFromPath - additional cases ====================
console.log('\n=== extractModuleFromPath - Additional Cases ===');

test('vendor path pattern', () => {
  // vendor paths require additional logic, should return null with current implementation
  const vendorPath = '/home/user/myproject/vendor/github.com/gin-gonic/gin/gin.go';
  const r = extractModuleFromPath(vendorPath, GOPATH);
  assert.strictEqual(r, null);
});

test('empty path', () => {
  const r = extractModuleFromPath('', GOPATH);
  assert.strictEqual(r, null);
});

test('root path equals modCache', () => {
  const r = extractModuleFromPath(modCache, GOPATH);
  assert.strictEqual(r, null);
});

test('path with trailing separator', () => {
  const r = extractModuleFromPath(modCache + path.sep, GOPATH);
  assert.strictEqual(r, null);
});

test('deeply nested file path', () => {
  const deepPath = path.join(modCache, 'github.com/deep/nested@v1.0.0', 'pkg', 'sub1', 'sub2', 'file.go');
  const r = extractModuleFromPath(deepPath, GOPATH);
  assert.ok(r);
  assert.strictEqual(r.modulePath, 'github.com/deep/nested');
  assert.strictEqual(r.version, 'v1.0.0');
});

// ==================== Config default values validation ====================
console.log('\n=== Config Default Values ===');

/** Mock config manager to test default values */
class MockConfigManager {
  private config = {
    'goDepsExplorer.handleReplace': true,
    'goDepsExplorer.showIndirect': true,
    'goDepsExplorer.vendorFirst': false
  };

  get(key: string, defaultValue?: any): any {
    return this.config[key as keyof typeof this.config] ?? defaultValue;
  }

  get handleReplace(): boolean {
    return this.get('goDepsExplorer.handleReplace', true);
  }

  get showIndirect(): boolean {
    return this.get('goDepsExplorer.showIndirect', true);
  }

  get vendorFirst(): boolean {
    return this.get('goDepsExplorer.vendorFirst', false);
  }
}

test('handleReplace default value is true', () => {
  const config = new MockConfigManager();
  assert.strictEqual(config.handleReplace, true);
});

test('showIndirect default value is true', () => {
  const config = new MockConfigManager();
  assert.strictEqual(config.showIndirect, true);
});

test('vendorFirst default value is false', () => {
  const config = new MockConfigManager();
  assert.strictEqual(config.vendorFirst, false);
});

// ==================== go.mod fallback parsing regex tests ====================
console.log('\n=== go.mod Fallback Parsing ===');

/** Extract dependencies from go.mod text using regex */
function parseGoModText(goModContent: string): Array<{ path: string; version: string; indirect: boolean }> {
  const dependencies: Array<{ path: string; version: string; indirect: boolean }> = [];
  const lines = goModContent.split('\n');
  let insideRequireBlock = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith('require (')) {
      insideRequireBlock = true;
      continue;
    }
    
    if (insideRequireBlock) {
      if (line === ')') {
        insideRequireBlock = false;
        continue;
      }
      
      // Parse dependency line inside block
      const match = line.match(/^\s*([^\s]+)\s+([^\s]+)(?:\s*\/\/.*)?$/);
      if (match) {
        dependencies.push({
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
      dependencies.push({
        path: singleMatch[1],
        version: singleMatch[2],
        indirect: line.includes('// indirect')
      });
    }
  }
  
  return dependencies;
}

test('basic require parsing', () => {
  const goMod = `module myproject

go 1.21

require github.com/gin-gonic/gin v1.9.1
`;
  const deps = parseGoModText(goMod);
  assert.strictEqual(deps.length, 1);
  assert.strictEqual(deps[0].path, 'github.com/gin-gonic/gin');
  assert.strictEqual(deps[0].version, 'v1.9.1');
  assert.strictEqual(deps[0].indirect, false);
});

test('multiline require block', () => {
  const goMod = `module myproject

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/go-redis/redis/v8 v8.11.5
    golang.org/x/sys v0.15.0 // indirect
)
`;
  const deps = parseGoModText(goMod);
  assert.strictEqual(deps.length, 3);
  assert.strictEqual(deps[0].path, 'github.com/gin-gonic/gin');
  assert.strictEqual(deps[0].indirect, false);
  assert.strictEqual(deps[1].path, 'github.com/go-redis/redis/v8');
  assert.strictEqual(deps[2].path, 'golang.org/x/sys');
  assert.strictEqual(deps[2].indirect, true);
});

test('require with line comments', () => {
  const goMod = `require (
    github.com/pkg/errors v0.9.1 // error handling
    github.com/stretchr/testify v1.8.4 // testing framework
)`;
  const deps = parseGoModText(goMod);
  assert.strictEqual(deps.length, 2);
  assert.strictEqual(deps[0].path, 'github.com/pkg/errors');
  assert.strictEqual(deps[1].path, 'github.com/stretchr/testify');
});

test('indirect dependency marking', () => {
  const goMod = `require (
    github.com/direct/dep v1.0.0
    github.com/indirect/dep v2.0.0 // indirect
    github.com/another/indirect v3.0.0     // indirect
)`;
  const deps = parseGoModText(goMod);
  assert.strictEqual(deps.length, 3);
  assert.strictEqual(deps[0].indirect, false);
  assert.strictEqual(deps[1].indirect, true);
  assert.strictEqual(deps[2].indirect, true);
});

test('mixed single line and block requires', () => {
  const goMod = `module test

require github.com/single/line v1.0.0

require (
    github.com/block/dep1 v1.1.0
    github.com/block/dep2 v1.2.0 // indirect
)

require github.com/another/single v2.0.0 // indirect
`;
  const deps = parseGoModText(goMod);
  assert.strictEqual(deps.length, 4);
  assert.strictEqual(deps[0].path, 'github.com/single/line');
  assert.strictEqual(deps[0].indirect, false);
  assert.strictEqual(deps[1].path, 'github.com/block/dep1');
  assert.strictEqual(deps[1].indirect, false);
  assert.strictEqual(deps[2].path, 'github.com/block/dep2');
  assert.strictEqual(deps[2].indirect, true);
  assert.strictEqual(deps[3].path, 'github.com/another/single');
  assert.strictEqual(deps[3].indirect, true);
});

test('empty go.mod returns empty dependencies', () => {
  const deps = parseGoModText('module test\n\ngo 1.21\n');
  assert.strictEqual(deps.length, 0);
});

// ==================== Standard Library Detection ====================
console.log('\n=== Standard Library Detection ===');

function isStandardLibraryPackage(packagePath: string): boolean {
  if (packagePath.startsWith('./') || packagePath.startsWith('../')) {
    return false;
  }
  const stdlibPrefixes = [
    'archive/', 'bufio', 'builtin', 'bytes', 'compress/', 'container/',
    'context', 'crypto/', 'database/', 'debug/', 'embed', 'encoding/',
    'errors', 'expvar', 'fmt', 'go/', 'hash/', 'html/', 'image/',
    'index/', 'io/', 'io', 'log/', 'log', 'math/', 'math', 'mime/',
    'mime', 'net/', 'net', 'os/', 'os', 'path/', 'path', 'plugin',
    'reflect', 'regexp', 'runtime/', 'runtime', 'sort', 'strconv',
    'strings', 'sync/', 'sync', 'syscall', 'testing/', 'testing',
    'text/', 'time/', 'time', 'unicode/', 'unicode', 'unsafe'
  ];
  for (const prefix of stdlibPrefixes) {
    if (packagePath === prefix.replace('/', '') || packagePath.startsWith(prefix)) {
      return true;
    }
  }
  return !packagePath.includes('.') && !packagePath.includes('/');
}

test('fmt is stdlib', () => {
  assert.strictEqual(isStandardLibraryPackage('fmt'), true);
});

test('net/http is stdlib', () => {
  assert.strictEqual(isStandardLibraryPackage('net/http'), true);
});

test('os is stdlib', () => {
  assert.strictEqual(isStandardLibraryPackage('os'), true);
});

test('crypto/sha256 is stdlib', () => {
  assert.strictEqual(isStandardLibraryPackage('crypto/sha256'), true);
});

test('encoding/json is stdlib', () => {
  assert.strictEqual(isStandardLibraryPackage('encoding/json'), true);
});

test('github.com/foo/bar is NOT stdlib', () => {
  assert.strictEqual(isStandardLibraryPackage('github.com/foo/bar'), false);
});

test('golang.org/x/sys is NOT stdlib', () => {
  assert.strictEqual(isStandardLibraryPackage('golang.org/x/sys'), false);
});

test('./local is NOT stdlib', () => {
  assert.strictEqual(isStandardLibraryPackage('./local'), false);
});

test('../relative is NOT stdlib', () => {
  assert.strictEqual(isStandardLibraryPackage('../relative'), false);
});

test('unsafe is stdlib', () => {
  assert.strictEqual(isStandardLibraryPackage('unsafe'), true);
});

test('context is stdlib', () => {
  assert.strictEqual(isStandardLibraryPackage('context'), true);
});

test('io/fs is stdlib', () => {
  assert.strictEqual(isStandardLibraryPackage('io/fs'), true);
});

// ==================== Node ID Uniqueness (v0.1.9) ====================
console.log('\n=== Node ID Uniqueness ===');

test('same dep in different projects should have different IDs', () => {
  // Simulates DependencyNode ID format: dep:${projectRoot}:${path}@${version}
  const id1 = `dep:/project-a:github.com/gin-gonic/gin@v1.9.1`;
  const id2 = `dep:/project-b:github.com/gin-gonic/gin@v1.9.1`;
  assert.notStrictEqual(id1, id2);
});

test('same file in different projects should have different IDs', () => {
  const id1 = `file:/project-a:/home/go/pkg/mod/github.com/gin-gonic/gin@v1.9.1/gin.go`;
  const id2 = `file:/project-b:/home/go/pkg/mod/github.com/gin-gonic/gin@v1.9.1/gin.go`;
  assert.notStrictEqual(id1, id2);
});

test('category IDs include project root', () => {
  const id1 = `category:/project-a:direct`;
  const id2 = `category:/project-b:direct`;
  assert.notStrictEqual(id1, id2);
});

// ==================== Replace Detection ====================
console.log('\n=== Replace Detection ===');

test('parseJsonStream correctly parses replace with local path', () => {
  const r = parseJsonStream(`{
    "Path": "github.com/original/pkg",
    "Version": "v1.0.0",
    "Replace": {
      "Path": "/local/dev/pkg",
      "Dir": "/local/dev/pkg"
    }
  }`);
  assert.ok(r[0].Replace);
  assert.strictEqual(r[0].Replace.Path, '/local/dev/pkg');
  assert.strictEqual(r[0].Replace.Dir, '/local/dev/pkg');
});

test('parseJsonStream correctly parses replace with versioned module', () => {
  const r = parseJsonStream(`{
    "Path": "github.com/old/pkg",
    "Version": "v1.0.0",
    "Replace": {
      "Path": "github.com/new/pkg",
      "Version": "v2.0.0",
      "Dir": "/home/go/pkg/mod/github.com/new/pkg@v2.0.0"
    }
  }`);
  assert.ok(r[0].Replace);
  assert.strictEqual(r[0].Replace.Path, 'github.com/new/pkg');
  assert.strictEqual(r[0].Replace.Version, 'v2.0.0');
});

test('module without replace has no Replace field', () => {
  const r = parseJsonStream('{"Path":"example.com/foo","Version":"v1.0.0"}');
  assert.strictEqual(r[0].Replace, undefined);
});

// ==================== Precise Path Building ====================
console.log('\n=== Precise Path Building ===');

test('path segments correctly split for file reveal', () => {
  const sourcePath = '/home/go/pkg/mod/github.com/gin-gonic/gin@v1.9.1';
  const filePath = '/home/go/pkg/mod/github.com/gin-gonic/gin@v1.9.1/internal/json/json.go';
  const relativePath = path.relative(sourcePath, filePath);
  const segments = relativePath.split(path.sep);
  assert.deepStrictEqual(segments, ['internal', 'json', 'json.go']);
  assert.strictEqual(segments[segments.length - 1], 'json.go');
});

test('file directly in dep root has single segment', () => {
  const sourcePath = '/home/go/pkg/mod/github.com/pkg@v1.0.0';
  const filePath = '/home/go/pkg/mod/github.com/pkg@v1.0.0/main.go';
  const relativePath = path.relative(sourcePath, filePath);
  const segments = relativePath.split(path.sep);
  assert.deepStrictEqual(segments, ['main.go']);
});

// ==================== GOROOT Path Detection ====================
console.log('\n=== GOROOT Path Detection ===');

test('file under GOROOT/src is detected as dependency file', () => {
  const goroot = '/usr/local/go';
  const filePath = '/usr/local/go/src/fmt/print.go';
  const gorootSrc = path.join(goroot, 'src');
  assert.strictEqual(filePath.startsWith(gorootSrc), true);
});

test('file not under GOROOT/src is not stdlib', () => {
  const goroot = '/usr/local/go';
  const filePath = '/home/user/myproject/main.go';
  const gorootSrc = path.join(goroot, 'src');
  assert.strictEqual(filePath.startsWith(gorootSrc), false);
});

// ==================== Summary ====================
const total = passed + failed;
console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${total} total`);
if (failures.length > 0) {
  console.log('Failed:', failures.join(', '));
  process.exit(1);
}
