# Changelog

## [0.1.21] - 2026-03-04

### Fixed
- Tree reveal no longer forces the Explorer panel open when it is hidden; reveal only triggers when the tree view is already visible

## [0.1.20] - 2026-03-04

### Changed
- Dependency source files now open via native `file://` URI instead of custom `go-dep:` scheme
- This enables Cmd+Click (Go to Definition) to work within dependency source code, as gopls can properly index files opened with standard file URIs

## [0.1.19] - 2026-03-04

### Changed
- Workspace mode: project nodes now display the name from .code-workspace file (folder name) instead of directory basename
- Project order in dependency tree matches the workspace folder order

## [0.1.17] - 2026-03-03

### Changed
- Enhanced package.json description with full feature summary
- Added keywords for better discoverability on VS Marketplace and Open VSX

## [0.1.16] - 2026-03-03

### Fixed
- Unified settings section title and README heading to "Go Deps Explorer" (was "Go Dependencies Explorer")

## [0.1.15] - 2026-03-03

### Fixed
- Unified Output Channel name to "Go Deps Explorer" (was split between "Go Dependencies Explorer" and "Go Deps Explorer")

## [0.1.14] - 2026-03-03

### Fixed
- `handleReplace` setting now works correctly: when disabled, dependencies show original path/version and source location instead of replaced ones
- Replace arrow-swap icon and "→ replaced" description only shown when `handleReplace` is enabled
- `getSourcePath()`: when `handleReplace=false`, skip `dep.dir` (which `go list` sets to replaced path) and use GOPATH for original module

## [0.1.13] - 2026-03-03

### Fixed
- Multi-project workspace: Cmd+Click on stdlib/dependency files now reveals under the correct project, not the first project that cached the node
- `findNodeForFile()`: when `preferredProjectRoot` is set but not cached, skip fallback to other projects' cache and go directly to `buildNodeChain` for the preferred project

## [0.1.12] - 2026-03-03

### Fixed
- Standard library packages now fully collected: includes TestImports, XTestImports, and transitive Deps (not just direct Imports)

## [0.1.11] - 2026-03-03

### Fixed
- Cmd+Click on Go standard library code now correctly locates and reveals the package in the dependency tree
- Fixed `isDependencyFile()`: replaced broken async Promise logic with cached `$GOROOT/src` path (initialized once via `go env GOROOT`)
- `findNodeForFile()` now also searches stdlib dependencies, not just module dependencies

## [0.1.10] - 2026-03-03

### Added
- Go standard library packages now shown in dependency tree under "Standard Library" category
  - Detected via `go list -json ./...` and filtered by stdlib package names
  - Browsable directory structure from `$GOROOT/src/`
  - Cmd+Click jump tracking support for stdlib source files
  - Distinct `symbol-package` icon for stdlib packages
- Replace directive dependencies now display a special `arrow-swap` icon with "→ replaced" description

## [0.1.9] - 2026-03-03

### Fixed
- Workspace mode: node IDs now include projectRoot to distinguish the same dependency across different projects
- DependencyNode ID changed from `dep:{path}@{version}` to `dep:{projectRoot}:{path}@{version}`
- DirectoryNode and FileNode IDs also include projectRoot to avoid cross-project cache collisions
- `findNodeForFile` prioritizes preferred project when looking up cached nodes

## [0.1.8] - 2026-03-03

### Fixed
- Workspace mode: correctly track which project the user jumped from by remembering the last non-dependency file's project root, instead of trying to resolve project from the dependency file path (which is in GOPATH, not in any workspace folder)

## [0.1.7] - 2026-03-03

### Fixed
- Reveal now only expands the exact path to the target file instead of expanding all directories under the dependency
- Build full node chain (dep → directories → file) so `reveal(fileNode)` expands only the needed path

## [0.1.6] - 2026-03-03

### Fixed
- Fixed: workspace mode reveal now targets the correct sub-project when multiple projects share the same dependency
- Fixed: tooltip now displays with proper line breaks and all labels in English

### Changed
- Changed: CHANGELOG rewritten in English

## [0.1.5] - 2026-03-03

### Fixed
- Completely reworked Cmd+Click jump tracking: unified node management with `nodeMap` ensures reveal works even when tree was never expanded
- `findNodeForFile()` now proactively builds the full node chain (root → category → dependency) when nodes aren't cached

## [0.1.4] - 2026-03-03

### Fixed
- Fixed go.mod fallback parser: now correctly handles multiple `require` blocks and single-line requires
- Added Output Channel "Go Deps Explorer" for diagnostics (check if `go list` fails)

## [0.1.3] - 2026-03-03

### Changed
- Category labels changed to English: "Direct Dependencies" / "Indirect Dependencies"

### Fixed
- Indirect dependencies now show "(source not available)" when local source is missing instead of appearing expandable but empty
- Dependencies without local source are no longer expandable (CollapsibleState.None)

## [0.1.2] - 2026-03-03

### Fixed
- Fixed Cmd+Click jump to dependency code not automatically expanding/locating in sidebar dependency tree
  - Root cause: reveal used temporary node objects, inconsistent with actual node references in tree
  - Solution: added node caching mechanism (categoryCache/dependencyCache/directoryCache/fileCache)
- Confirmed category labels display in Chinese ("Direct Dependencies"/"Indirect Dependencies")

## [0.1.1] - 2026-03-03

### Fixed
- Fixed Cmd+Click jump positioning: added node caching to ensure reveal reference consistency
- Code review fixes: simplified readonlyFileViewer, unified utils usage, completed eslintrc

## [0.1.0] - 2026-03-03

### Added
- Initial release
- Explorer sidebar dependency tree view
- Direct/indirect dependency grouping display
- Dependency package directory browsing (lazy loading)
- Read-only file viewing (custom URI scheme)
- Cmd+Click jump tracking and tree positioning
- Multi-project workspace support
- Auto-refresh on go.mod changes
- Manual refresh button
- Configuration options: handleReplace, showIndirect, vendorFirst
- Dependency details tooltip (version, path, replace info, repository links)