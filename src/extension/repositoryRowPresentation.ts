import * as vscode from "vscode";

export type RepositoryRowSummary = {
  branch: string;
  dirtyCount: number;
  latestCommitAt: number;
  name: string;
  path: string;
  worktreeCount: number;
};

const REPOSITORY_ROW_SCHEME = "git-fleet-repository";

export function formatRepositoryAge(timestamp: number): string {
  if (timestamp === 0) {
    return "no commits";
  }
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (elapsedMinutes < 60) {
    return elapsedMinutes <= 1 ? "now" : `${elapsedMinutes}m`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h`;
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) {
    return `${elapsedDays}d`;
  }
  return `${Math.floor(elapsedDays / 30)}mo`;
}

export function compactMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  const available = maxLength - 1;
  const prefixLength = Math.ceil(available * 0.45);
  return `${value.slice(0, prefixLength)}…${value.slice(-(available - prefixLength))}`;
}

export function formatRepositoryLabel(name: string): string {
  return compactMiddle(name, 22);
}

export function formatRepositoryDescription(summary: RepositoryRowSummary): string {
  const worktrees = summary.worktreeCount > 1 ? ` · ${summary.worktreeCount}wt` : "";
  return `${formatRepositoryAge(summary.latestCommitAt)}${worktrees} · ${compactMiddle(summary.branch, 22)}`;
}

export function getRepositoryDecoration(summary: RepositoryRowSummary): {
  badge: string;
  colorId: string;
  tooltip: string;
} {
  if (summary.dirtyCount === 0) {
    return {
      badge: "✓",
      colorId: "gitDecoration.addedResourceForeground",
      tooltip: "Clean working tree"
    };
  }
  return {
    badge: String(Math.min(summary.dirtyCount, 99)),
    colorId: "gitDecoration.modifiedResourceForeground",
    tooltip: `${summary.dirtyCount} dirty ${summary.dirtyCount === 1 ? "file" : "files"}`
  };
}

export function createRepositoryRowUri(summary: RepositoryRowSummary): vscode.Uri {
  const decoration = getRepositoryDecoration(summary);
  return vscode.Uri.from({
    scheme: REPOSITORY_ROW_SCHEME,
    path: summary.path,
    query: new URLSearchParams({
      badge: decoration.badge,
      color: decoration.colorId,
      tooltip: decoration.tooltip
    }).toString()
  });
}

export class RepositoryRowDecorationProvider implements vscode.FileDecorationProvider {
  public provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== REPOSITORY_ROW_SCHEME) {
      return undefined;
    }
    const values = new URLSearchParams(uri.query);
    const badge = values.get("badge");
    const color = values.get("color");
    const tooltip = values.get("tooltip");
    if (!badge || !color || !tooltip) {
      return undefined;
    }
    return new vscode.FileDecoration(badge, tooltip, new vscode.ThemeColor(color));
  }
}
