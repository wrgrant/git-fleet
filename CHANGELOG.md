# Changelog

## [Unreleased]

## [0.2.2] - 2026-08-05

### Added

- Persistent right-edge repository badges showing a clean checkmark or dirty-file count

### Changed

- Repository rows now prioritize update age, compact branch names, and worktree count when the navigator is narrow
- Long repository and branch names use middle ellipses while their complete values remain in tooltips and accessibility labels
- Repository tree item IDs are stable across dirty-state changes so selection survives refreshes

## [0.2.1] - 2026-08-05

### Added

- A native watched-folder manager with a macOS folder chooser, current-folder list, and per-folder remove buttons

### Changed

- The navigator settings button now opens the watched-folder manager while preserving the raw machine-overridable setting for portability

## [0.2.0] - 2026-08-05

### Added

- Independent repository layout and sort controls, including activity, dirty-file, and alphabetical sorting inside folder trees
- Bidirectional selection between the repository navigator and the graph repository picker
- Commit search across messages, authors, hashes, branches, tags, and stash labels
- Worktree visibility, repository terminal, fetch, settings, and icon-only refresh actions in the graph header
- Inline terminal and fetch actions on repository rows
- Stash history and labels in the show-all graph; tag history remains visible

### Changed

- Kept graph controls anchored above the worktree rail at narrow panel widths
- Capped repository and branch picker widths with ellipsis and full-value tooltips
- Made collapse-all available only in folder-tree layout
- Made the clean-repository eye show the current visibility state

## [0.1.0] - 2026-08-05

The first Git Fleet release, forked from Neo Git Graph 0.5.0.

### Added

- A dedicated Git Fleet Activity Bar pane for cross-repository navigation
- Repository arrangements by recent activity, dirty-file count, or folder tree
- A persistent hide-clean-repositories control
- Configurable global repository search roots for projects outside the workspace
- Nested repository discovery to a default depth of four folders
- Clickable Uncommitted Changes details with file-level diffs
- A right-side Git worktree rail with confirmed HEAD positions, dirty state, branch information, inferred bases, and offscreen continuation arrows
- Manifest regression tests for valid VS Code view identifiers

### Changed

- Renamed the extension, commands, settings, views, logs, and diff scheme to Git Fleet
- Moved cross-repository navigation out of the built-in Source Control pane
- Kept the graph cell visible through row selection styling
- Updated the product identity to `wgrant-dev.git-fleet`

### Security

- Removed an inherited hard-coded GitLab token from avatar lookup requests

## Neo Git Graph history

Git Fleet began from Neo Git Graph 0.5.0. Its earlier changelog remains available in the [upstream repository](https://github.com/asispts/neo-git-graph/blob/main/CHANGELOG.md).

[Unreleased]: https://github.com/wrgrant/git-fleet/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/wrgrant/git-fleet/releases/tag/v0.2.2
[0.2.1]: https://github.com/wrgrant/git-fleet/releases/tag/v0.2.1
[0.2.0]: https://github.com/wrgrant/git-fleet/releases/tag/v0.2.0
[0.1.0]: https://github.com/wrgrant/git-fleet/releases/tag/v0.1.0
