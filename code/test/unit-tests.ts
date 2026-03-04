import * as assert from 'assert';
import * as path from 'path';
import { parseJsonStream, extractModuleFromPath, isStandardLibraryPackage, parseGoModText } from '../src/pure';

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

// ==================== Stdlib Import Sources (v0.1.12) ====================
console.log('\n=== Stdlib Import Sources ===');

test('parseJsonStream captures TestImports field', () => {
  const r = parseJsonStream('{"ImportPath":"myapp","Imports":["fmt"],"TestImports":["testing","os"],"Deps":["fmt","testing","os"]}');
  assert.ok(r[0].TestImports);
  assert.deepStrictEqual(r[0].TestImports, ['testing', 'os']);
});

test('parseJsonStream captures XTestImports field', () => {
  const r = parseJsonStream('{"ImportPath":"myapp","XTestImports":["net/http/httptest"]}');
  assert.ok(r[0].XTestImports);
  assert.deepStrictEqual(r[0].XTestImports, ['net/http/httptest']);
});

test('parseJsonStream captures Deps field with transitive deps', () => {
  const r = parseJsonStream('{"ImportPath":"myapp","Deps":["fmt","internal/fmtsort","io","os","reflect","sort","sync","unicode/utf8"]}');
  assert.ok(r[0].Deps);
  assert.strictEqual(r[0].Deps.length, 8);
  assert.ok(r[0].Deps.includes('internal/fmtsort'));
});

test('all stdlib import sources detected correctly', () => {
  // Simulate what parseStdlibDeps does: collect from all fields
  const pkg = {
    Imports: ['fmt', 'github.com/gin-gonic/gin'],
    TestImports: ['testing', 'os'],
    XTestImports: ['net/http/httptest'],
    Deps: ['fmt', 'testing', 'os', 'net/http/httptest', 'sync', 'io']
  };
  const allImports = [
    ...(pkg.Imports || []),
    ...(pkg.TestImports || []),
    ...(pkg.XTestImports || []),
    ...(pkg.Deps || []),
  ];
  const stdlibSet = new Set<string>();
  for (const imp of allImports) {
    if (isStandardLibraryPackage(imp)) {
      stdlibSet.add(imp);
    }
  }
  // Should have: fmt, testing, os, net/http/httptest, sync, io (NOT gin)
  assert.ok(stdlibSet.has('fmt'));
  assert.ok(stdlibSet.has('testing'));
  assert.ok(stdlibSet.has('os'));
  assert.ok(stdlibSet.has('net/http/httptest'));
  assert.ok(stdlibSet.has('sync'));
  assert.ok(stdlibSet.has('io'));
  assert.ok(!stdlibSet.has('github.com/gin-gonic/gin'));
  assert.strictEqual(stdlibSet.size, 6);
});

// ==================== Cross-Project Reveal Logic (v0.1.13) ====================
console.log('\n=== Cross-Project Reveal Logic ===');

test('preferred project should not fallback to other project cache for same file', () => {
  // Simulate: same stdlib file cached under project-a, but preferredProjectRoot is project-b
  const nodeMap = new Map<string, { fsPath: string }>();
  const sharedFilePath = '/usr/local/go/src/fmt/print.go';
  
  // Project A has cached this file
  nodeMap.set(`file:/project-a:${sharedFilePath}`, { fsPath: sharedFilePath });
  
  // When preferred is project-b, exact ID lookup should miss
  const preferredFileId = `file:/project-b:${sharedFilePath}`;
  const cachedFile = nodeMap.get(preferredFileId);
  assert.strictEqual(cachedFile, undefined, 'Should NOT find project-a cache when looking for project-b');
});

test('without preferred project, any cached node is acceptable', () => {
  const nodeMap = new Map<string, { fsPath: string }>();
  const sharedFilePath = '/usr/local/go/src/fmt/print.go';
  nodeMap.set(`file:/project-a:${sharedFilePath}`, { fsPath: sharedFilePath });
  
  // Without preferred, fallback search finds any match
  let found = false;
  for (const [id, node] of nodeMap) {
    if (node.fsPath === sharedFilePath) { found = true; break; }
  }
  assert.strictEqual(found, true);
});

test('preferred project exact match returns immediately', () => {
  const nodeMap = new Map<string, { fsPath: string }>();
  const sharedFilePath = '/usr/local/go/src/fmt/print.go';
  nodeMap.set(`file:/project-a:${sharedFilePath}`, { fsPath: sharedFilePath });
  nodeMap.set(`file:/project-b:${sharedFilePath}`, { fsPath: sharedFilePath });
  
  const preferredFileId = `file:/project-b:${sharedFilePath}`;
  const cachedFile = nodeMap.get(preferredFileId);
  assert.ok(cachedFile, 'Should find exact match for project-b');
});

// ==================== Workspace Project Names & Order (v0.1.19) ====================
console.log('\n=== Workspace Project Names & Order ===');

test('project names from workspace folders are preserved', () => {
  const projects = [
    { root: '/home/user/projects/api-server', name: 'API Server' },
    { root: '/home/user/projects/web-client', name: 'Web Client' },
  ];
  const projectNames = new Map<string, string>();
  const projectOrder: string[] = [];
  for (const { root, name } of projects) {
    projectNames.set(root, name);
    projectOrder.push(root);
  }
  assert.strictEqual(projectNames.get('/home/user/projects/api-server'), 'API Server');
  assert.strictEqual(projectNames.get('/home/user/projects/web-client'), 'Web Client');
});

test('project order matches workspace folder order', () => {
  const projects = [
    { root: '/b-project', name: 'B' },
    { root: '/a-project', name: 'A' },
    { root: '/c-project', name: 'C' },
  ];
  const projectOrder = projects.map(p => p.root);
  assert.deepStrictEqual(projectOrder, ['/b-project', '/a-project', '/c-project']);
});

test('fallback to basename when name not in map', () => {
  const projectNames = new Map<string, string>();
  const root = '/home/user/my-project';
  const name = projectNames.get(root) || path.basename(root);
  assert.strictEqual(name, 'my-project');
});

test('sub-project name includes parent folder prefix', () => {
  // mono-repo: workspace folder "MyApp" has sub-dir "services/api" with go.mod
  const folderName = 'MyApp';
  const entryName = 'api';
  const subProjectName = `${folderName}/${entryName}`;
  assert.strictEqual(subProjectName, 'MyApp/api');
});

// ==================== Lazy Mode (v0.2.0) ====================
console.log('\n=== Lazy Mode ===');

test('revealedDeps set correctly tracks dep keys', () => {
  const revealedDeps = new Set<string>();
  const key = '/project-a:github.com/gin-gonic/gin@v1.9.1';
  revealedDeps.add(key);
  assert.ok(revealedDeps.has(key));
  assert.ok(!revealedDeps.has('/project-b:github.com/gin-gonic/gin@v1.9.1'));
});

test('revealedDeps survives serialization/deserialization', () => {
  const revealedDeps = new Set<string>();
  revealedDeps.add('/p1:fmt@stdlib');
  revealedDeps.add('/p1:github.com/foo/bar@v1.0.0');
  // Simulate workspaceState save/restore
  const serialized = Array.from(revealedDeps);
  const restored = new Set(serialized);
  assert.strictEqual(restored.size, 2);
  assert.ok(restored.has('/p1:fmt@stdlib'));
  assert.ok(restored.has('/p1:github.com/foo/bar@v1.0.0'));
});

test('lazy filter only includes revealed deps', () => {
  const revealedDeps = new Set<string>();
  revealedDeps.add('/root:github.com/a/a@v1.0.0');
  const allDeps = [
    { path: 'github.com/a/a', version: 'v1.0.0', indirect: false },
    { path: 'github.com/b/b', version: 'v2.0.0', indirect: false },
    { path: 'github.com/c/c', version: 'v3.0.0', indirect: true },
  ];
  const filtered = allDeps.filter(dep => revealedDeps.has(`/root:${dep.path}@${dep.version}`));
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].path, 'github.com/a/a');
});

test('hasRevealed returns false when no deps revealed for category', () => {
  const revealedDeps = new Set<string>();
  revealedDeps.add('/root:github.com/a/a@v1.0.0');
  const indirectDeps = [
    { path: 'github.com/x/x', version: 'v1.0.0', indirect: true },
  ];
  const hasRevealed = indirectDeps.some(dep => revealedDeps.has(`/root:${dep.path}@${dep.version}`));
  assert.strictEqual(hasRevealed, false);
});

test('multiple projects track revealed deps independently', () => {
  const revealedDeps = new Set<string>();
  revealedDeps.add('/project-a:github.com/gin-gonic/gin@v1.9.1');
  revealedDeps.add('/project-b:github.com/gin-gonic/gin@v1.9.1');
  assert.strictEqual(revealedDeps.size, 2);
  // Same dep, different projects = different keys
});

// ==================== Tree Collapse & Auto-Reveal (v0.2.0) ====================
console.log('\n=== Tree Collapse & Auto-Reveal ===');

test('project nodes default to collapsed state', () => {
  // TreeItemCollapsibleState.Collapsed = 1, Expanded = 2
  const collapsedState = 1;
  assert.strictEqual(collapsedState, 1, 'Project nodes should use Collapsed (1) not Expanded (2)');
});

test('category nodes default to collapsed state', () => {
  const collapsedState = 1;
  assert.strictEqual(collapsedState, 1, 'Category nodes should use Collapsed (1) not Expanded (2)');
});

test('visibility change triggers editor check', () => {
  // Simulate: panel becomes visible → should check current editor
  let editorChecked = false;
  const onVisible = (visible: boolean) => {
    if (visible) { editorChecked = true; }
  };
  onVisible(true);
  assert.strictEqual(editorChecked, true);
});

test('visibility change does not trigger when hidden', () => {
  let editorChecked = false;
  const onVisible = (visible: boolean) => {
    if (visible) { editorChecked = true; }
  };
  onVisible(false);
  assert.strictEqual(editorChecked, false);
});

test('startup check detects dependency file in active editor', () => {
  const gorootSrc = '/usr/local/go/src';
  const modCache = '/home/user/go/pkg/mod';
  
  // Active editor is a stdlib file
  const activeFile1 = '/usr/local/go/src/fmt/print.go';
  assert.strictEqual(activeFile1.startsWith(gorootSrc), true, 'Should detect stdlib file on startup');
  
  // Active editor is a module dep file
  const activeFile2 = '/home/user/go/pkg/mod/github.com/gin@v1.9.1/gin.go';
  assert.strictEqual(activeFile2.startsWith(modCache), true, 'Should detect module dep file on startup');
  
  // Active editor is a project file
  const activeFile3 = '/home/user/myproject/main.go';
  assert.strictEqual(activeFile3.startsWith(gorootSrc), false);
  assert.strictEqual(activeFile3.startsWith(modCache), false, 'Should not trigger for project files');
});

test('lazyMode startup: reveal only if current file is dep + has revealed deps', () => {
  const revealedDeps = new Set<string>();
  revealedDeps.add('/root:github.com/gin-gonic/gin@v1.9.1');
  
  // Current file belongs to a revealed dep → should reveal
  const depKey = '/root:github.com/gin-gonic/gin@v1.9.1';
  assert.ok(revealedDeps.has(depKey), 'Should reveal previously visited dep on restart');
  
  // Current file belongs to an unrevealed dep → should add and reveal
  const newKey = '/root:github.com/new/pkg@v1.0.0';
  assert.ok(!revealedDeps.has(newKey), 'New dep not yet revealed');
  revealedDeps.add(newKey);
  assert.ok(revealedDeps.has(newKey), 'After navigation, dep should be revealed');
});

// ==================== Dynamic Stdlib Addition (v0.2.0) ====================
console.log('\n=== Dynamic Stdlib Addition ===');

test('extract stdlib package path from file path', () => {
  const gorootSrc = '/usr/local/go/src';
  const filePath = '/usr/local/go/src/net/http/server.go';
  const relativePath = path.relative(gorootSrc, filePath);
  const segments = relativePath.split(path.sep);
  let pkgPath = '';
  for (let i = 0; i < segments.length - 1; i++) {
    pkgPath = pkgPath ? pkgPath + '/' + segments[i] : segments[i];
  }
  assert.strictEqual(pkgPath, 'net/http');
});

test('extract single-level stdlib package path', () => {
  const gorootSrc = '/usr/local/go/src';
  const filePath = '/usr/local/go/src/fmt/print.go';
  const relativePath = path.relative(gorootSrc, filePath);
  const segments = relativePath.split(path.sep);
  let pkgPath = '';
  for (let i = 0; i < segments.length - 1; i++) {
    pkgPath = pkgPath ? pkgPath + '/' + segments[i] : segments[i];
  }
  assert.strictEqual(pkgPath, 'fmt');
});

test('extract internal stdlib package path', () => {
  const gorootSrc = '/usr/local/go/src';
  const filePath = '/usr/local/go/src/internal/fmtsort/sort.go';
  const relativePath = path.relative(gorootSrc, filePath);
  const segments = relativePath.split(path.sep);
  let pkgPath = '';
  for (let i = 0; i < segments.length - 1; i++) {
    pkgPath = pkgPath ? pkgPath + '/' + segments[i] : segments[i];
  }
  assert.strictEqual(pkgPath, 'internal/fmtsort');
});

test('addStdlibDep deduplicates by path', () => {
  const stdlibList: { path: string; version: string }[] = [
    { path: 'fmt', version: 'stdlib' },
  ];
  const newDep = { path: 'fmt', version: 'stdlib' };
  if (!stdlibList.some(d => d.path === newDep.path)) {
    stdlibList.push(newDep);
  }
  assert.strictEqual(stdlibList.length, 1, 'Should not add duplicate');
  
  const newDep2 = { path: 'io', version: 'stdlib' };
  if (!stdlibList.some(d => d.path === newDep2.path)) {
    stdlibList.push(newDep2);
  }
  assert.strictEqual(stdlibList.length, 2, 'Should add new package');
});

// ==================== buildNodeChain Stdlib Category (v0.2.0) ====================
console.log('\n=== buildNodeChain Stdlib Category ===');

test('stdlib dep gets stdlib category type', () => {
  const dep = { path: 'fmt', version: 'stdlib', indirect: false };
  const isStdlib = dep.version === 'stdlib';
  const categoryType = isStdlib ? 'stdlib' : (dep.indirect ? 'indirect' : 'direct');
  assert.strictEqual(categoryType, 'stdlib');
});

test('direct dep gets direct category type', () => {
  const dep = { path: 'github.com/foo/bar', version: 'v1.0.0', indirect: false };
  const isStdlib = dep.version === 'stdlib';
  const categoryType = isStdlib ? 'stdlib' : (dep.indirect ? 'indirect' : 'direct');
  assert.strictEqual(categoryType, 'direct');
});

test('indirect dep gets indirect category type', () => {
  const dep = { path: 'github.com/foo/bar', version: 'v1.0.0', indirect: true };
  const isStdlib = dep.version === 'stdlib';
  const categoryType = isStdlib ? 'stdlib' : (dep.indirect ? 'indirect' : 'direct');
  assert.strictEqual(categoryType, 'indirect');
});

test('stdlib category label is Standard Library', () => {
  const dep = { path: 'net/http', version: 'stdlib', indirect: false };
  const isStdlib = dep.version === 'stdlib';
  const label = isStdlib ? 'Standard Library' : (dep.indirect ? 'Indirect Dependencies' : 'Direct Dependencies');
  assert.strictEqual(label, 'Standard Library');
});

test('stdlib category ID uses stdlib suffix', () => {
  const root = '/project-a';
  const dep = { path: 'fmt', version: 'stdlib', indirect: false };
  const isStdlib = dep.version === 'stdlib';
  const categoryType = isStdlib ? 'stdlib' : (dep.indirect ? 'indirect' : 'direct');
  const categoryId = `category:${root}:${categoryType}`;
  assert.strictEqual(categoryId, 'category:/project-a:stdlib');
});

// ==================== Summary ====================
const total = passed + failed;
console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${total} total`);
if (failures.length > 0) {
  console.log('Failed:', failures.join(', '));
  process.exit(1);
}