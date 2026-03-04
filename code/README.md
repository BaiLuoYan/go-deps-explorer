# Go Deps Explorer

Browse, explore, and navigate Go project dependencies directly in VS Code.

## Features

### 📦 Dependency Tree
- View all **direct** and **indirect** dependencies from `go.mod`
- Browse dependency source code with full directory structure
- **Standard Library** packages displayed in a separate category
- **Replace directives** shown with a special arrow-swap icon and "→ replaced" label

### 🔗 Cmd+Click Jump Tracking
- **Cmd+Click** (Go to Definition) on any import automatically locates the dependency in the tree
- Works in your project code, dependency source code, and standard library source code
- Stdlib packages not in the initial scan are dynamically added when first navigated to

### 🦥 Lazy Mode
- Enable `goDepsExplorer.lazyMode` to start with an empty dependency tree
- Dependencies appear only when you navigate to their source code
- Previously visited dependencies are preserved across navigations
- Persisted across restarts — your explored dependencies are remembered

### 🗂️ Multi-Project Workspace
- Full support for VS Code multi-root workspaces
- Each project shows its own dependency tree with correct isolation
- Project names and order match your `.code-workspace` configuration

### 🔄 Auto-Reveal
- On startup, if the active editor is a dependency file, the tree expands to it
- When the Explorer panel becomes visible, the current dependency file is automatically located
- All tree nodes default to collapsed state for a clean view

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `goDepsExplorer.handleReplace` | boolean | `true` | Show replaced dependency paths and source locations |
| `goDepsExplorer.showIndirect` | boolean | `true` | Show indirect dependencies in the tree |
| `goDepsExplorer.vendorFirst` | boolean | `false` | Prefer vendor directory over GOPATH module cache |
| `goDepsExplorer.lazyMode` | boolean | `false` | Only show dependencies when navigating to their source code |

## Requirements

- VS Code 1.74.0+
- Go toolchain installed (`go` command available in PATH)
- Project with `go.mod` file

## Links

- [GitHub Repository](https://github.com/BaiLuoYan/go-deps-explorer)
- [Changelog](https://github.com/BaiLuoYan/go-deps-explorer/blob/main/code/CHANGELOG.md)
- [Report Issues](https://github.com/BaiLuoYan/go-deps-explorer/issues)
