# Content discovery queue

## 2026-08-05 — Audit inherited network code before publishing a fork

- Why it matters: An MIT license permits reuse, but a public release still needs its own credential and privacy audit.
- Evidence: The inherited GitLab avatar request contained a hard-coded API token. Git Fleet removed the token and retained the public unauthenticated lookup path.
- Files changed: `src/avatarManager.ts`, `SECURITY.md`, `CHANGELOG.md`
- Suggested content angle: Rebranding is the visible part of launching a fork; inspecting every outbound request is the part that keeps the launch safe.

## 2026-08-05 — Treat the working tree as graph data, not a decorative row

- Why it matters: Users already understand Neo's commit detail tree, so the useful extension is making the uncommitted pseudo-commit satisfy the same data contract and open combined HEAD-to-checkout diffs.
- Evidence: The `*` commit now returns file changes, opens the shared details tree, and routes added, modified, renamed, and deleted working-tree paths through VS Code's diff editor.
- Files changed: `src/backend/queries/commitDetails.ts`, `src/extension/messageHandler.ts`, `src/webview/main.ts`, `src/diffDocProvider.ts`
- Suggested content angle: A small data-model repair can unlock a large interaction without duplicating UI.

## 2026-08-05 — Overlay worktree state on the history users already know

- Why it matters: A worktree count answers how many checkouts exist but not where their HEADs or inferred branch points sit in history.
- Evidence: The graph now has a dedicated right rail, live HEAD/base connectors, row cues, and viewport-edge arrows for offscreen or unloaded endpoints.
- Files changed: `src/backend/queries/loadWorktrees.ts`, `src/webview/graph.ts`, `src/webview/main.ts`, `media/main.css`
- Suggested content angle: Git records worktree HEADs but not creation points, so honest visualization distinguishes confirmed state from inferred merge bases.

## 2026-08-04 — A repository navigator should not be an action surface

- Status: idea
- Evidence: The built-in Source Control pane repeats commit inputs, large primary buttons, and dense toolbars for every repository. In the supplied example, a repository with 811 dirty files makes fleet-level navigation effectively disappear.
- Product insight: Separate the cross-repository questions (where is activity, what is dirty, which repository needs attention) from repository-level Git mutations. Keep the left pane compact and navigational; keep detailed history and actions in the graph.
- Platform insight: VS Code extensions can contribute a dedicated Activity Bar View Container containing a native Tree View. This avoids rewriting Source Control entirely and lets users move the whole Git Fleet surface to the secondary sidebar or bottom panel.
- Implementation surfaces: `src/extension/repoNavigator.ts`, `src/extension/initExtension.ts`, `package.json`
- Discovery guardrail: Parent-folder scans deliberately skip dependency and build-cache directories such as `node_modules`, `.venv`, `DerivedData`, and `target`, so increasing the useful default scan depth does not flood the navigator with generated checkouts.

## 2026-08-04 — Stop replacing built-in panes; compose a new native surface

- Status: idea
- Why it matters: Extension APIs are strongest when a product adds a focused navigation surface instead of trying to subtract controls from a built-in one.
- Evidence: The repository tree moved from the Source Control container to one custom Activity Bar View Container. The resulting toolbar needs only three controls: layout, hide/show clean repositories, and refresh.
- Files changed: `package.json`, `src/extension/repoNavigator.ts`, `src/extensionState.ts`, `resources/repository-navigator.svg`
- Suggested content angle: A short build thread showing how a screenshot complaint about 811 dirty files led from “replace Source Control” to “create a native Git Fleet panel.”
