import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compactMiddle,
  createRepositoryRowUri,
  formatRepositoryDescription,
  formatRepositoryLabel,
  getRepositoryDecoration,
  RepositoryRowDecorationProvider,
  RepositoryRowSummary
} from "@/extension/repositoryRowPresentation";

const vscodeMock = vi.hoisted(() => ({
  FileDecoration: class FileDecoration {
    constructor(
      public readonly badge: string,
      public readonly tooltip: string,
      public readonly color: unknown
    ) {}
  },
  ThemeColor: class ThemeColor {
    constructor(public readonly id: string) {}
  },
  Uri: { from: (value: unknown) => value }
}));

vi.mock("vscode", () => vscodeMock);

function summary(overrides: Partial<RepositoryRowSummary> = {}): RepositoryRowSummary {
  return {
    branch: "codex/player-school-attendance-defaults",
    dirtyCount: 43,
    latestCommitAt: Date.now() - 48 * 60_000,
    name: "team-builder-cloud",
    path: "/repos/team-builder-cloud",
    worktreeCount: 8,
    ...overrides
  };
}

afterEach(() => vi.useRealTimers());

describe("repository row presentation", () => {
  it("compacts long labels and branches through the middle", () => {
    expect(compactMiddle("codex/player-school-attendance-defaults", 22)).toHaveLength(22);
    expect(compactMiddle("main", 22)).toBe("main");
    expect(formatRepositoryLabel("a-very-long-repository-name-that-keeps-going")).toContain("…");
  });

  it("keeps age and worktree count ahead of a compact branch", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T20:00:00Z"));
    const row = summary({ latestCommitAt: Date.now() - 48 * 60_000 });

    expect(formatRepositoryDescription(row)).toBe("48m · 8wt · codex/play…ce-defaults");
  });

  it("uses a right-edge clean or bounded dirty badge", () => {
    expect(getRepositoryDecoration(summary({ dirtyCount: 0 }))).toMatchObject({
      badge: "✓",
      tooltip: "Clean working tree"
    });
    expect(getRepositoryDecoration(summary({ dirtyCount: 143 }))).toMatchObject({
      badge: "99",
      tooltip: "143 dirty files"
    });
  });

  it("round-trips the status through the custom row URI decoration provider", () => {
    const uri = createRepositoryRowUri(summary({ dirtyCount: 2 }));
    const decoration = new RepositoryRowDecorationProvider().provideFileDecoration(uri);

    expect(decoration).toMatchObject({ badge: "2", tooltip: "2 dirty files" });
    expect((decoration!.color as { id: string }).id).toBe(
      "gitDecoration.modifiedResourceForeground"
    );
  });
});
