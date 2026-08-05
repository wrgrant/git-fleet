import { beforeAll, describe, expect, it, vi } from "vitest";

import type { GitCommitNode, GitWorktree } from "@/backend/types";
import type * as GG from "@/types";

import { createVscodeMock, receive, setupHtml } from "./setup";

const REPO = "/workspace/repo";
const head = "abc123abc123abc123abc123abc123abc123abcd";
const commits: GitCommitNode[] = [
  {
    hash: "*",
    parentHashes: [head],
    author: "*",
    email: "",
    date: 1700000100,
    message: "Uncommitted Changes (2)",
    refs: []
  },
  {
    hash: head,
    parentHashes: [],
    author: "Alice",
    email: "alice@example.com",
    date: 1700000000,
    message: "Initial commit",
    refs: [{ hash: head, name: "main", type: "head" }]
  }
];

const viewState: GG.GitGraphViewState = {
  autoCenterCommitDetailsView: true,
  dateFormat: "Date & Time",
  fetchAvatars: false,
  graphColours: ["#0085d9"],
  graphStyle: "rounded",
  initialLoadCommits: 300,
  lastActiveRepo: null,
  loadMoreCommits: 75,
  locale: "en",
  repos: { [REPO]: { columnWidths: null } },
  showCurrentBranchByDefault: false
};

describe("working tree and worktree rendering", () => {
  let vscodeMock: ReturnType<typeof createVscodeMock>;

  beforeAll(async () => {
    vi.resetModules();
    vscodeMock = createVscodeMock();
    setupHtml(viewState);
    await import("@/webview/main");
    receive({
      command: "loadBranches",
      branches: ["main"],
      head: "main",
      hard: true,
      isRepo: true
    });
    receive({ command: "loadCommits", commits, head, moreCommitsAvailable: false, hard: true });
  });

  it("makes the Uncommitted Changes row request the shared details view", () => {
    vscodeMock.clearMessages();
    const row = document.querySelector<HTMLElement>('tr[data-hash="*"]');
    expect(row).not.toBeNull();
    expect(row!.classList.contains("commit")).toBe(true);

    row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(vscodeMock.sentMessages).toContainEqual({
      command: "commitDetails",
      repo: REPO,
      commitHash: "*"
    });
  });

  it("renders the right-side worktree rail from repository worktree data", () => {
    const worktrees: GitWorktree[] = [
      {
        path: REPO,
        head,
        branch: "main",
        current: true,
        detached: false,
        locked: null,
        prunable: null,
        dirtyCount: 2,
        baseSha: head,
        ahead: 0,
        behind: 0
      }
    ];
    receive({ command: "loadWorktrees", worktrees, baselineRef: "main" });

    expect(document.getElementById("worktreeRail")!.hidden).toBe(false);
    expect(document.querySelector(".worktreeItem")!.textContent).toContain("main");
    expect(document.body.classList.contains("worktreesVisible")).toBe(true);
  });

  it("toggles worktree visibility without removing worktree data", () => {
    document.getElementById("worktreesBtn")!.click();
    expect(document.getElementById("worktreeRail")!.hidden).toBe(true);
    expect(document.body.classList.contains("worktreesVisible")).toBe(false);

    document.getElementById("worktreesBtn")!.click();
    expect(document.getElementById("worktreeRail")!.hidden).toBe(false);
  });

  it("sends repository-scoped toolbar actions", () => {
    vscodeMock.clearMessages();
    document.getElementById("terminalBtn")!.click();
    document.getElementById("fetchBtn")!.click();
    document.getElementById("settingsBtn")!.click();

    expect(vscodeMock.sentMessages).toContainEqual({ command: "openTerminal", repo: REPO });
    expect(vscodeMock.sentMessages).toContainEqual({ command: "fetchRepository", repo: REPO });
    expect(vscodeMock.sentMessages).toContainEqual({ command: "openSettings" });
  });

  it("searches loaded commit messages and reports the match", () => {
    document.getElementById("searchBtn")!.click();
    const input = document.getElementById("commitSearchInput") as HTMLInputElement;
    input.value = "Initial";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    expect(document.getElementById("commitSearchStatus")!.textContent).toBe("1 of 1");
  });
});
