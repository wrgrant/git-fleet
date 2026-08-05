import { describe, expect, it, vi } from "vitest";

import { filterRepositorySummaries, RepositorySummary } from "@/extension/repoNavigator";

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({ get: (_key: string, defaultValue: unknown) => defaultValue })
  }
}));

function summary(name: string, dirtyCount: number): RepositorySummary {
  return {
    branch: "main",
    dirtyCount,
    latestCommitAt: 0,
    latestCommitMessage: "Test commit",
    name,
    path: `/repos/${name}`,
    worktreeCount: 1
  };
}

describe("filterRepositorySummaries", () => {
  const repositories = [summary("clean", 0), summary("dirty", 3)];

  it("returns every repository when the filter is disabled", () => {
    expect(filterRepositorySummaries(repositories, false)).toEqual(repositories);
  });

  it("hides repositories without uncommitted changes", () => {
    expect(filterRepositorySummaries(repositories, true)).toEqual([repositories[1]]);
  });
});
