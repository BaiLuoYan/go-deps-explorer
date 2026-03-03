# Changelog

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