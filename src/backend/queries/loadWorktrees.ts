import * as fs from "node:fs";
import * as path from "node:path";

import type { SimpleGit } from "simple-git";

import type { GitWorktree, QueryResult } from "@/backend/types";

type ParsedWorktree = {
  path: string;
  head: string;
  branch: string;
  detached: boolean;
  locked: string | null;
  prunable: string | null;
};

function comparablePath(value: string) {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}

function parseWorktrees(stdout: string): ParsedWorktree[] {
  return stdout
    .trim()
    .split(/\r?\n\r?\n/)
    .filter(Boolean)
    .map((block) => {
      const worktree: ParsedWorktree = {
        path: "",
        head: "",
        branch: "(detached)",
        detached: false,
        locked: null,
        prunable: null
      };
      for (const line of block.split(/\r?\n/)) {
        const separator = line.indexOf(" ");
        const key = separator === -1 ? line : line.substring(0, separator);
        const value = separator === -1 ? "" : line.substring(separator + 1);
        if (key === "worktree") {
          worktree.path = value;
        } else if (key === "HEAD") {
          worktree.head = value;
        } else if (key === "branch") {
          worktree.branch = value.replace(/^refs\/heads\//, "");
        } else if (key === "detached") {
          worktree.detached = true;
        } else if (key === "locked") {
          worktree.locked = value || "locked";
        } else if (key === "prunable") {
          worktree.prunable = value || "prunable";
        }
      }
      return worktree;
    })
    .filter((worktree) => worktree.path !== "" && worktree.head !== "");
}

async function resolveBaseline(git: SimpleGit): Promise<{ ref: string; sha: string } | null> {
  const candidates: string[] = [];
  try {
    candidates.push(
      (await git.raw(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"])).trim()
    );
  } catch {
    // Repositories without an origin HEAD fall through to conventional branches.
  }
  candidates.push("main", "master");
  try {
    const current = (await git.raw(["branch", "--show-current"])).trim();
    if (current) {
      candidates.push(current);
    }
  } catch {
    // A detached checkout can still resolve one of the earlier candidates.
  }
  const uniqueCandidates = new Set(candidates.filter(Boolean));
  const resolved = await Promise.all(
    Array.from(uniqueCandidates, async (ref) => {
      try {
        return { ref, sha: (await git.revparse([ref])).trim() };
      } catch {
        return null;
      }
    })
  );
  for (const candidate of resolved) {
    if (candidate !== null) {
      return candidate;
    }
  }
  return null;
}

async function tryRaw(git: SimpleGit, args: string[]): Promise<string | null> {
  try {
    const output = (await git.raw(args)).trim();
    return output || null;
  } catch {
    return null;
  }
}

export async function loadWorktrees(
  git: SimpleGit,
  currentRepo: string
): Promise<QueryResult<"loadWorktrees">> {
  try {
    const [rawWorktrees, baseline] = await Promise.all([
      git.raw(["worktree", "list", "--porcelain"]),
      resolveBaseline(git)
    ]);
    const parsed = parseWorktrees(rawWorktrees);
    const worktrees: GitWorktree[] = await Promise.all(
      parsed.map(async (worktree) => {
        const usable = worktree.prunable === null && fs.existsSync(worktree.path);
        const [dirtyOutput, forkPoint, mergeBase, counts] = await Promise.all([
          usable
            ? tryRaw(git, [
                "-C",
                worktree.path,
                "status",
                "--porcelain=v1",
                "--untracked-files=all"
              ])
            : Promise.resolve(null),
          baseline && worktree.head !== baseline.sha
            ? tryRaw(git, ["merge-base", "--fork-point", baseline.ref, worktree.head])
            : Promise.resolve(null),
          baseline && worktree.head !== baseline.sha
            ? tryRaw(git, ["merge-base", baseline.ref, worktree.head])
            : Promise.resolve(baseline?.sha ?? null),
          baseline
            ? tryRaw(git, [
                "rev-list",
                "--left-right",
                "--count",
                `${baseline.ref}...${worktree.head}`
              ])
            : Promise.resolve(null)
        ]);
        const [behind, ahead] = counts?.split(/\s+/).map(Number) ?? [null, null];
        return {
          path: worktree.path,
          head: worktree.head,
          branch: worktree.branch,
          detached: worktree.detached,
          locked: worktree.locked,
          prunable: worktree.prunable,
          current: comparablePath(worktree.path) === comparablePath(currentRepo),
          dirtyCount:
            dirtyOutput === null
              ? usable
                ? 0
                : null
              : dirtyOutput.split(/\r?\n/).filter(Boolean).length,
          baseSha: worktree.head === baseline?.sha ? worktree.head : (forkPoint ?? mergeBase),
          ahead: Number.isFinite(ahead) ? ahead : null,
          behind: Number.isFinite(behind) ? behind : null
        };
      })
    );
    return { worktrees, baselineRef: baseline?.ref ?? null };
  } catch {
    return { worktrees: [], baselineRef: null };
  }
}
