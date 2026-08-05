import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { simpleGit } from "simple-git";
import { afterEach, describe, expect, it } from "vitest";

import { loadWorktrees } from "@/backend/queries/loadWorktrees";

import { git, makeRepo } from "@tests/backend/helpers";

const cleanup: string[] = [];

afterEach(() => {
  for (const directory of cleanup.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("loadWorktrees", () => {
  it("returns the main checkout and linked worktrees with inferred history points", async () => {
    const repo = makeRepo();
    const worktreeParent = fs.mkdtempSync(path.join(os.tmpdir(), "ngg-worktree-test-"));
    const linked = path.join(worktreeParent, "feature-checkout");
    cleanup.push(worktreeParent, repo);
    git(["worktree", "add", "-b", "feature/test", linked], repo);
    fs.writeFileSync(path.join(linked, "dirty-file"), "dirty");

    const result = await loadWorktrees(simpleGit(repo), repo);

    expect(result.baselineRef).toBe("main");
    expect(result.worktrees).toHaveLength(2);
    expect(result.worktrees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branch: "main",
          current: true,
          baseSha: expect.any(String)
        }),
        expect.objectContaining({
          branch: "feature/test",
          current: false,
          dirtyCount: 1,
          baseSha: expect.any(String),
          ahead: 0,
          behind: 0
        })
      ])
    );
  });
});
