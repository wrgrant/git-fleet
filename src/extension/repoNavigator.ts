import * as path from "node:path";

import { simpleGit } from "simple-git";
import * as vscode from "vscode";

import { evalPromises } from "@/backend/utils/promise";
import { config } from "@/config";
import { getRepositorySearchRoots } from "@/extension/repositorySearchRoots";
import { ExtensionState } from "@/extensionState";
import { RepositoryNavigatorMode } from "@/types";

import { RepoManager } from "./repoManager";

const VIEW_ID = "git-fleet.repositoryNavigator";
const HIDE_CLEAN_CONTEXT = "gitFleet.hideCleanRepositories";

export type RepositorySummary = {
  branch: string;
  dirtyCount: number;
  latestCommitAt: number;
  latestCommitMessage: string;
  name: string;
  path: string;
  worktreeCount: number;
};

export function filterRepositorySummaries(
  summaries: RepositorySummary[],
  hideCleanRepositories: boolean
): RepositorySummary[] {
  return hideCleanRepositories ? summaries.filter((summary) => summary.dirtyCount > 0) : summaries;
}

type RepositoryNode = {
  kind: "repository";
  summary: RepositorySummary;
};

type FolderNode = {
  children: NavigatorNode[];
  kind: "folder";
  label: string;
};

type NavigatorNode = FolderNode | RepositoryNode;

type MutableFolder = FolderNode & { folders: Map<string, MutableFolder> };

const MODE_LABELS: Record<RepositoryNavigatorMode, string> = {
  activity: "Recent activity",
  dirty: "Dirty files",
  tree: "Folder tree"
};

function formatAge(timestamp: number): string {
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

async function loadRepositorySummary(repoPath: string): Promise<RepositorySummary> {
  const git = simpleGit({
    baseDir: repoPath,
    binary: config.gitPath(),
    maxConcurrentProcesses: 3,
    trimmed: false
  });

  try {
    const [status, log, worktreeOutput] = await Promise.all([
      git.status(),
      git.log({ maxCount: 1 }),
      git.raw(["worktree", "list", "--porcelain"]).catch(() => "")
    ]);
    const latest = log.latest;
    const latestCommitAt = latest ? Date.parse(latest.date) : 0;
    const worktreeCount = worktreeOutput
      .split("\n")
      .filter((line) => line.startsWith("worktree ")).length;

    return {
      branch: status.current ?? "detached",
      dirtyCount: status.files.length,
      latestCommitAt: Number.isNaN(latestCommitAt) ? 0 : latestCommitAt,
      latestCommitMessage: latest?.message ?? "No commits yet",
      name: path.basename(repoPath),
      path: repoPath,
      worktreeCount: Math.max(1, worktreeCount)
    };
  } catch {
    return {
      branch: "unavailable",
      dirtyCount: 0,
      latestCommitAt: 0,
      latestCommitMessage: "Repository details could not be loaded",
      name: path.basename(repoPath),
      path: repoPath,
      worktreeCount: 1
    };
  }
}

function sortNodes(nodes: NavigatorNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "folder" ? -1 : 1;
    }
    const aLabel = a.kind === "folder" ? a.label : a.summary.name;
    const bLabel = b.kind === "folder" ? b.label : b.summary.name;
    return aLabel.localeCompare(bLabel);
  });
  for (const node of nodes) {
    if (node.kind === "folder") {
      sortNodes(node.children);
    }
  }
}

function buildFolderTree(summaries: RepositorySummary[]): NavigatorNode[] {
  const searchRoots = getRepositorySearchRoots();
  const root: MutableFolder = { children: [], folders: new Map(), kind: "folder", label: "" };

  for (const summary of summaries) {
    const containingRoot = searchRoots
      .filter((rootPath) => {
        const relative = path.relative(rootPath, summary.path);
        return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
      })
      .toSorted((a, b) => b.length - a.length)[0];

    const relativePath = containingRoot
      ? path.relative(containingRoot, summary.path)
      : summary.name;
    const segments = (relativePath === "" ? [summary.name] : relativePath.split(path.sep)).filter(
      Boolean
    );
    if (searchRoots.length > 1 && containingRoot) {
      segments.unshift(path.basename(containingRoot));
    }

    let parent = root;
    for (const segment of segments.slice(0, -1)) {
      let folder = parent.folders.get(segment);
      if (!folder) {
        folder = { children: [], folders: new Map(), kind: "folder", label: segment };
        parent.folders.set(segment, folder);
        parent.children.push(folder);
      }
      parent = folder;
    }
    parent.children.push({ kind: "repository", summary });
  }

  sortNodes(root.children);
  return root.children;
}

class RepositoryNavigatorProvider implements vscode.TreeDataProvider<NavigatorNode> {
  private readonly changeEmitter = new vscode.EventEmitter<NavigatorNode | undefined>();
  private loading: Promise<RepositorySummary[]> | undefined;
  private summaries: RepositorySummary[] | undefined;

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public constructor(
    private readonly repoManager: RepoManager,
    private readonly extensionState: ExtensionState
  ) {}

  public get mode(): RepositoryNavigatorMode {
    return this.extensionState.getRepositoryNavigatorMode();
  }

  public get hideCleanRepositories(): boolean {
    return this.extensionState.getHideCleanRepositories();
  }

  public setMode(mode: RepositoryNavigatorMode): void {
    this.extensionState.setRepositoryNavigatorMode(mode);
    this.changeEmitter.fire(undefined);
  }

  public setHideCleanRepositories(hidden: boolean): void {
    this.extensionState.setHideCleanRepositories(hidden);
    this.changeEmitter.fire(undefined);
  }

  public refresh(): void {
    this.loading = undefined;
    this.summaries = undefined;
    this.changeEmitter.fire(undefined);
  }

  public getTreeItem(node: NavigatorNode): vscode.TreeItem {
    if (node.kind === "folder") {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon("folder");
      item.contextValue = "repositoryNavigator.folder";
      return item;
    }

    const { summary } = node;
    const item = new vscode.TreeItem(summary.name, vscode.TreeItemCollapsibleState.None);
    const state = summary.dirtyCount === 0 ? "clean" : `${summary.dirtyCount} dirty`;
    const worktrees = summary.worktreeCount > 1 ? ` · ${summary.worktreeCount} worktrees` : "";
    item.description = `${summary.branch} · ${state}${worktrees} · ${formatAge(summary.latestCommitAt)}`;
    item.iconPath =
      summary.dirtyCount === 0
        ? new vscode.ThemeIcon("repo")
        : new vscode.ThemeIcon(
            "circle-filled",
            new vscode.ThemeColor("gitDecoration.modifiedResourceForeground")
          );
    item.contextValue = "repositoryNavigator.repository";
    item.command = {
      arguments: [summary.path],
      command: "git-fleet.openRepositoryGraph",
      title: "Open Repository Graph"
    };
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${summary.name}**  \n`);
    tooltip.appendText(`${summary.path}\n`);
    tooltip.appendMarkdown(`\n${summary.latestCommitMessage}  \n`);
    tooltip.appendText(
      `${summary.branch} · ${summary.dirtyCount} dirty files · ${summary.worktreeCount} worktrees`
    );
    item.tooltip = tooltip;
    return item;
  }

  public async getChildren(node?: NavigatorNode): Promise<NavigatorNode[]> {
    if (node?.kind === "folder") {
      return node.children;
    }
    if (node?.kind === "repository") {
      return [];
    }

    const summaries = filterRepositorySummaries(
      await this.getSummaries(),
      this.hideCleanRepositories
    );
    if (this.mode === "tree") {
      return buildFolderTree(summaries);
    }

    const sorted = [...summaries];
    if (this.mode === "dirty") {
      sorted.sort((a, b) => b.dirtyCount - a.dirtyCount || b.latestCommitAt - a.latestCommitAt);
    } else {
      sorted.sort((a, b) => b.latestCommitAt - a.latestCommitAt || a.name.localeCompare(b.name));
    }
    return sorted.map((summary) => ({ kind: "repository", summary }));
  }

  private getSummaries(): Promise<RepositorySummary[]> {
    if (this.summaries) {
      return Promise.resolve(this.summaries);
    }
    this.loading ??= evalPromises(
      Object.keys(this.repoManager.getRepos()),
      4,
      loadRepositorySummary
    )
      .then((summaries) => {
        this.summaries = summaries;
        return summaries;
      })
      .finally(() => {
        this.loading = undefined;
      });
    return this.loading;
  }
}

export function registerRepositoryNavigator(
  ctx: vscode.ExtensionContext,
  repoManager: RepoManager,
  extensionState: ExtensionState,
  rescanRepositories: () => Promise<void> = async () => {}
): void {
  const provider = new RepositoryNavigatorProvider(repoManager, extensionState);
  const treeView = vscode.window.createTreeView(VIEW_ID, {
    showCollapseAll: true,
    treeDataProvider: provider
  });

  const updateDescription = () => {
    treeView.description = `${MODE_LABELS[provider.mode]}${provider.hideCleanRepositories ? " · Dirty only" : ""}`;
  };
  updateDescription();
  void vscode.commands.executeCommand(
    "setContext",
    HIDE_CLEAN_CONTEXT,
    provider.hideCleanRepositories
  );

  const setHideCleanRepositories = (hidden: boolean) => {
    provider.setHideCleanRepositories(hidden);
    updateDescription();
    void vscode.commands.executeCommand("setContext", HIDE_CLEAN_CONTEXT, hidden);
  };

  const deregisterRepoListener = repoManager.registerViewCallback(() => provider.refresh());
  ctx.subscriptions.push(
    treeView,
    { dispose: deregisterRepoListener },
    vscode.commands.registerCommand("git-fleet.refreshRepositoryNavigator", async () => {
      await rescanRepositories();
      provider.refresh();
    }),
    vscode.commands.registerCommand("git-fleet.changeRepositoryNavigatorMode", async () => {
      const modes: Array<{ description: string; label: string; mode: RepositoryNavigatorMode }> = [
        {
          description: "Newest commit first",
          label: MODE_LABELS.activity,
          mode: "activity"
        },
        {
          description: "Most uncommitted files first",
          label: MODE_LABELS.dirty,
          mode: "dirty"
        },
        {
          description: "Mirror folders below the workspace",
          label: MODE_LABELS.tree,
          mode: "tree"
        }
      ];
      const selection = await vscode.window.showQuickPick(modes, {
        placeHolder: "Choose how repositories are arranged"
      });
      if (selection) {
        provider.setMode(selection.mode);
        updateDescription();
      }
    }),
    vscode.commands.registerCommand("git-fleet.hideCleanRepositories", () =>
      setHideCleanRepositories(true)
    ),
    vscode.commands.registerCommand("git-fleet.showAllRepositories", () =>
      setHideCleanRepositories(false)
    ),
    vscode.workspace.onDidSaveTextDocument(() => provider.refresh()),
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) {
        provider.refresh();
      }
    })
  );
}
