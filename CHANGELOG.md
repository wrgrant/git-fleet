# Changelog

## [Unreleased]

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

[Unreleased]: https://github.com/wrgrant/git-fleet/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/wrgrant/git-fleet/releases/tag/v0.1.0
