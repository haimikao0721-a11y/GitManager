[中文](README.md) | [English](README.en.md)

# Git Manager

A lightweight desktop tool for managing multiple Git accounts, local repositories, and workspace commits.

## Launch

- **Desktop Shortcut**: Double-click the `Git管理器` shortcut on Desktop (runs `dist\启动.ps1`, starts the local `gitcore.exe` service, and opens a standalone Edge app window without spawning `explorer.exe` to avoid `0xc0000142` errors).
- **Release Package**: Download and extract `GitCore-v0.0.3-win-x64.zip`, then double-click **`GitManager.cmd`**.

## Key Features

- **Account & Local Identity Switching**: Manage multiple Git accounts (HTTPS & SSH), switch the global default account from the bottom account menu, or switch the local commit identity and `HTTPS / SSH` protocol per repository directly from the workspace header.
- **Drive-Grouped Explorer & Multi-Repo Tabs**: The collapsible left sidebar (`Ctrl+B`) lists scanned repositories grouped by drive (`C:` / `D:`) with instant filtering; the top bar provides multi-repo workspace tabs with cached state snapshots, a quick `+` switcher popover, and `Alt+[` / `Alt+]` tab navigation.
- **Unified Workbench & Side Inspector**: Combines commit composer, grouped file changes, branches/stashes, and a full colored commit graph in one workbench alongside a resizable right inspector (`Ctrl+Shift+B`) for commit details, diffs, and the repository file tree.
- **Diff & Hunk Staging**: Supports file and hunk-level stage/unstage, stash diff inspection, high-contrast red/green diff highlighting across Dark/Light/Sepia themes, and serialized Git execution with `index.lock` diagnostics and one-click stale lock recovery.
- **Environment & Utilities**: Quick access from the bottom account menu to account management, batch repository switching, and settings (filtered Git credentials, SSH keys, and proxy configuration).

## Shortcuts

- `Ctrl+K`: Open Command Palette
- `Ctrl+B`: Toggle Left Sidebar
- `Ctrl+Shift+B`: Toggle Right Inspector Panel
- `Alt+[` / `Alt+]` (or `Ctrl+PageUp` / `Ctrl+PageDown`): Switch between open repository tabs
- `Ctrl+Enter`: Commit staged changes
