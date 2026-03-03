# Go Deps Explorer

Browse and explore Go project dependencies directly in VS Code.

## Features

- 📦 **Dependency Tree** — View all direct and indirect dependencies in the Explorer sidebar
- 📂 **Browse Source** — Expand any dependency to browse its complete directory structure
- 👁️ **Read-only View** — Click any file to view its source code (read-only)
- 🔗 **Jump Tracking** — Cmd+Click into dependency code and the tree auto-locates the file
- 📁 **Workspace Support** — Multi-project workspaces show dependencies grouped by project
- 🔄 **Auto Refresh** — Dependency tree updates automatically when go.mod changes

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `goDepsExplorer.handleReplace` | `true` | Handle `replace` directives in go.mod |
| `goDepsExplorer.showIndirect` | `true` | Show indirect (transitive) dependencies |
| `goDepsExplorer.vendorFirst` | `false` | Prefer vendor directory over GOPATH module cache |

## Requirements

- Go toolchain installed and available in PATH
- A Go project with `go.mod` in the workspace

## License

MIT
