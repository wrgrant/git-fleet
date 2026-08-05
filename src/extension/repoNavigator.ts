import * as path from "node:path";

import { simpleGit } from "simple-git";
import * as vscode from "vscode";

import { evalPromises } from "@/backend/utils/promise";
import { config } from "@/config";
import { getRepositorySearchRoots } from "@/extension/repositorySearchRoots";
import { ExtensionState } from "@/extensionState";
import { RepositoryNavigatorLayout, RepositoryNavigatorSort } from "@/types";

import { RepoManager } from "./repoManager";

const VIEW_ID = "git-fleet.repositoryNavigator";
const HIDE_CLEAN_CONTEXT = "gitFleet.hideCleanRepositories";
const TREE_LAYOUT_CONTEXT = "gitFleet.repositoryLayoutTree";

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
  parent?: FolderNode;
  summary: RepositorySummary;
};

type FolderNode = {
  children: NavigatorNode[];
  kind: "folder";
  label: string;
  parent?: FolderNode;
};

type NavigatorNode = FolderNode | RepositoryNode;

type MutableFolder = FolderNode & { folders: Map<string, MutableFolder> };

const SORT_LABELS: Record<RepositoryNavigatorSort, string> = {
  activity: "Recent activity",
  alphabetical: "Alphabetical",
  dirty: "Dirty files"
};

const LAYOUT_LABELS: Record<RepositoryNavigatorLayout, string> = {
  list: "List",
  tree: "Folder tree"
};

export function repositoryPathFromCommandArgument(argument: unknown): string | undefined {
  if (typeof argument === "string") {
    return argument;
  }
  if (
    typeof argument === "object" &&
    argument !== null &&
    "kind" in argument &&
    argument.kind === "repository" &&
    "summary" in argument
  ) {
    return (argument as RepositoryNode).summary.path;
  }
  return undefined;
}

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

function compareRepositories(
  a: RepositorySummary,
  b: RepositorySummary,
  sort: RepositoryNavigatorSort
) {
  if (sort === "dirty") {
    return (
      b.dirtyCount - a.dirtyCount ||
      b.latestCommitAt - a.latestCommitAt ||
      a.name.localeCompare(b.name)
    );
  }
  if (sort === "activity") {
    return b.latestCommitAt - a.latestCommitAt || a.name.localeCompare(b.name);
  }
  return a.name.localeCompare(b.name);
}

function sortNodes(nodes: NavigatorNode[], sort: RepositoryNavigatorSort): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "folder" ? -1 : 1;
    }
    if (a.kind === "folder" && b.kind === "folder") {
      return a.label.localeCompare(b.label);
    }
    if (a.kind === "repository" && b.kind === "repository") {
      return compareRepositories(a.summary, b.summary, sort);
    }
    return 0;
  });
  for (const node of nodes) {
    if (node.kind === "folder") {
      sortNodes(node.children, sort);
    }
  }
}

function buildFolderTree(
  summaries: RepositorySummary[],
  sort: RepositoryNavigatorSort
): NavigatorNode[] {
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
        folder = {
          children: [],
          folders: new Map(),
          kind: "folder",
          label: segment,
          parent: parent === root ? undefined : parent
        };
        parent.folders.set(segment, folder);
        parent.children.push(folder);
      }
      parent = folder;
    }
    parent.children.push({
      kind: "repository",
      parent: parent === root ? undefined : parent,
      summary
    });
  }

  sortNodes(root.children, sort);
  return root.children;
}

class RepositoryNavigatorProvider implements vscode.TreeDataProvider<NavigatorNode> {
  private readonly changeEmitter = new vscode.EventEmitter<NavigatorNode | undefined>();
  private loading: Promise<RepositorySummary[]> | undefined;
  private summaries: RepositorySummary[] | undefined;
  private rootNodes: NavigatorNode[] | undefined;

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public constructor(
    private readonly repoManager: RepoManager,
    private readonly extensionState: ExtensionState
  ) {}

  public get layout(): RepositoryNavigatorLayout {
    return this.extensionState.getRepositoryNavigatorLayout();
  }

  public get sort(): RepositoryNavigatorSort {
    return this.extensionState.getRepositoryNavigatorSort();
  }

  public get hideCleanRepositories(): boolean {
    return this.extensionState.getHideCleanRepositories();
  }

  public setLayout(layout: RepositoryNavigatorLayout): void {
    this.extensionState.setRepositoryNavigatorLayout(layout);
    this.rootNodes = undefined;
    this.changeEmitter.fire(undefined);
  }

  public setSort(sort: RepositoryNavigatorSort): void {
    this.extensionState.setRepositoryNavigatorSort(sort);
    this.rootNodes = undefined;
    this.changeEmitter.fire(undefined);
  }

  public setHideCleanRepositories(hidden: boolean): void {
    this.extensionState.setHideCleanRepositories(hidden);
    this.rootNodes = undefined;
    this.changeEmitter.fire(undefined);
  }

  public refresh(): void {
    this.loading = undefined;
    this.summaries = undefined;
    this.rootNodes = undefined;
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

    if (this.rootNodes) {
      return this.rootNodes;
    }
    const summaries = filterRepositorySummaries(
      await this.getSummaries(),
      this.hideCleanRepositories
    );
    if (this.layout === "tree") {
      this.rootNodes = buildFolderTree(summaries, this.sort);
      return this.rootNodes;
    }

    const sorted = [...summaries];
    sorted.sort((a, b) => compareRepositories(a, b, this.sort));
    this.rootNodes = sorted.map((summary) => ({ kind: "repository", summary }));
    return this.rootNodes;
  }

  public getParent(node: NavigatorNode): NavigatorNode | undefined {
    return node.parent;
  }

  public async findRepository(repoPath: string): Promise<RepositoryNode | undefined> {
    const visit = (nodes: NavigatorNode[]): RepositoryNode | undefined => {
      for (const node of nodes) {
        if (node.kind === "repository" && node.summary.path === repoPath) {
          return node;
        }
        if (node.kind === "folder") {
          const match = visit(node.children);
          if (match) {
            return match;
          }
        }
      }
      return undefined;
    };
    return visit(await this.getChildren());
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
): { revealRepository(repoPath: string): Promise<void> } {
  const provider = new RepositoryNavigatorProvider(repoManager, extensionState);
  const treeView = vscode.window.createTreeView(VIEW_ID, {
    showCollapseAll: false,
    treeDataProvider: provider
  });

  const updateDescription = () => {
    treeView.description = `${LAYOUT_LABELS[provider.layout]} · ${SORT_LABELS[provider.sort]}${provider.hideCleanRepositories ? " · Dirty only" : ""}`;
  };
  updateDescription();
  void vscode.commands.executeCommand(
    "setContext",
    HIDE_CLEAN_CONTEXT,
    provider.hideCleanRepositories
  );
  void vscode.commands.executeCommand(
    "setContext",
    TREE_LAYOUT_CONTEXT,
    provider.layout === "tree"
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
    vscode.commands.registerCommand("git-fleet.changeRepositoryNavigatorLayout", async () => {
      const layouts: Array<{
        description: string;
        label: string;
        layout: RepositoryNavigatorLayout;
      }> = [
        {
          description: "One compact repository list",
          label: LAYOUT_LABELS.list,
          layout: "list"
        },
        {
          description: "Mirror folders below the search roots",
          label: LAYOUT_LABELS.tree,
          layout: "tree"
        }
      ];
      const selection = await vscode.window.showQuickPick(layouts, {
        placeHolder: "Choose the repository layout"
      });
      if (selection) {
        provider.setLayout(selection.layout);
        void vscode.commands.executeCommand(
          "setContext",
          TREE_LAYOUT_CONTEXT,
          selection.layout === "tree"
        );
        updateDescription();
      }
    }),
    vscode.commands.registerCommand("git-fleet.changeRepositoryNavigatorSort", async () => {
      const sorts: Array<{ description: string; label: string; sort: RepositoryNavigatorSort }> = [
        { description: "Newest commit first", label: SORT_LABELS.activity, sort: "activity" },
        { description: "Most uncommitted files first", label: SORT_LABELS.dirty, sort: "dirty" },
        { description: "Repository name", label: SORT_LABELS.alphabetical, sort: "alphabetical" }
      ];
      const selection = await vscode.window.showQuickPick(sorts, {
        placeHolder: "Choose how repositories are sorted"
      });
      if (selection) {
        provider.setSort(selection.sort);
        updateDescription();
      }
    }),
    vscode.commands.registerCommand("git-fleet.collapseRepositoryFolders", () =>
      vscode.commands.executeCommand(`workbench.actions.treeView.${VIEW_ID}.collapseAll`)
    ),
    vscode.commands.registerCommand("git-fleet.hideCleanRepositories", () =>
      setHideCleanRepositories(true)
    ),
    vscode.commands.registerCommand("git-fleet.showAllRepositories", () =>
      setHideCleanRepositories(false)
    ),
    vscode.commands.registerCommand("git-fleet.openRepositoryTerminal", (argument: unknown) => {
      const repoPath = repositoryPathFromCommandArgument(argument);
      if (!repoPath) {
        return;
      }
      vscode.window
        .createTerminal({ cwd: repoPath, name: `Git Fleet: ${path.basename(repoPath)}` })
        .show();
    }),
    vscode.commands.registerCommand("git-fleet.fetchRepository", async (argument: unknown) => {
      const repoPath = repositoryPathFromCommandArgument(argument);
      if (!repoPath) {
        return;
      }
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: `Fetching ${path.basename(repoPath)}` },
        () => simpleGit({ baseDir: repoPath, binary: config.gitPath() }).fetch(["--all", "--prune"])
      );
      provider.refresh();
    }),
    vscode.workspace.onDidSaveTextDocument(() => provider.refresh()),
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) {
        provider.refresh();
      }
    })
  );

  return {
    async revealRepository(repoPath: string) {
      const node = await provider.findRepository(repoPath);
      if (node) {
        await treeView.reveal(node, { expand: true, focus: false, select: true });
      }
    }
  };
}
