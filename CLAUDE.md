# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A VSCode extension that displays Go project dependencies in a tree view sidebar. It activates on workspaces containing `go.mod` files and uses `go list` / `go env` CLI tools at runtime to resolve dependencies.

All extension source code lives in the `code/` subdirectory. Documentation lives in `docs/`.

## Commands

All commands must be run from the `code/` directory.

```bash
# Install dependencies
pnpm install

# Compile TypeScript
pnpm compile

# Watch mode (for development)
pnpm watch

# Type-check without emitting
pnpm tsc --noEmit

# Lint
pnpm lint

# Run unit tests (no VSCode needed — runs via tsx directly)
pnpm test:unit

# Package as .vsix
pnpm package
```

The unit tests in `test/unit-tests.ts` run standalone via `tsx` and do not require a VSCode extension host. They test pure functions from `src/pure.ts`.

Integration tests (`pnpm test`) require a VSCode extension host via `@vscode/test-electron`.

## Architecture

The extension entry point is `src/extension.ts`. On `activate()`, it:
1. Scans workspace folders for `go.mod` files (including one level of subdirectories for mono-repos)
2. Initializes `ConfigManager`, `GoModParser`, `DependencyTreeProvider`
3. Registers a `TreeView`, commands, `ReadonlyFileViewer`, `EditorTracker`, `GoModWatcher`

### Core components

| File | Responsibility |
|------|---------------|
| `extension.ts` | Lifecycle, component wiring, command registration |
| `dependencyTreeProvider.ts` | `vscode.TreeDataProvider` implementation; drives the sidebar tree; handles Lazy Mode |
| `goModParser.ts` | Shells out to `go list -m -json all`, `go list -json ./...`, `go env GOROOT` to get dependency info |
| `editorTracker.ts` | Watches `onDidChangeActiveTextEditor`; when a dep file is opened (via Cmd+Click or tree), reveals it in the tree and marks it readonly |
| `goModWatcher.ts` | File watcher for `go.mod` changes; debounced refresh |
| `configManager.ts` | Wraps `vscode.workspace.getConfiguration` for the four settings |
| `readonlyFileViewer.ts` | Opens files with `workbench.action.files.setActiveEditorReadonlyInSession` |
| `models.ts` | `TreeNode` union type: `ProjectNode`, `CategoryNode`, `DependencyNode`, `DirectoryNode`, `FileNode` |
| `pure.ts` | Side-effect-free utilities: `parseJsonStream`, `extractModuleFromPath`, `isStandardLibraryPackage`, `parseGoModText` |

### Key design decisions

**Node IDs** are namespaced by project root: `dep:/project-root:module@version`, `file:/project-root:/abs/path`. This is required for multi-project workspace support — the same dep can appear under multiple projects.

**Lazy Mode** (`goDepsExplorer.lazyMode`): the tree starts empty and deps are added only when their source files are navigated to. Revealed deps are persisted in `workspaceState` as a serialized `Set<string>` with keys `projectRoot:module@version`.

**Dependency file detection**: a file is considered a dep file if its path starts with `$GOPATH/pkg/mod` (module cache) or `$GOROOT/src` (standard library). The `$GOPATH` is resolved via `go env GOPATH`; GOROOT via `go env GOROOT`.

**Standard library** deps use `version: 'stdlib'` as a sentinel. The `isStandardLibraryPackage` function in `pure.ts` uses a prefix allowlist — it does not invoke `go` tooling.

**`parseJsonStream`** in `pure.ts` manually parses brace-balanced JSON objects from `go list` output (which emits multiple adjacent JSON objects, not a JSON array).

**`parseGoModText`** is a regex-based fallback parser for `go.mod` used when `go list` is unavailable.

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `goDepsExplorer.handleReplace` | `true` | Process `replace` directives in go.mod |
| `goDepsExplorer.showIndirect` | `true` | Show indirect dependencies |
| `goDepsExplorer.vendorFirst` | `false` | Prefer `vendor/` over GOPATH module cache |
| `goDepsExplorer.lazyMode` | `false` | Only show deps when navigating to their source |

## Build Output

TypeScript compiles to `code/out/`. The extension entry point resolves to `out/extension.js`. The `out/` directory is excluded from `tsconfig.json` and should not be committed.

## Packaging & Publishing

```bash
# Package
pnpm package   # produces go-deps-explorer-{version}.vsix

# Publish (requires vsce login BaiLuoYan first)
pnpm publish
```

Update `package.json` version and `CHANGELOG.md` before publishing. See `docs/deploy/build-publish.md` for the full checklist.
