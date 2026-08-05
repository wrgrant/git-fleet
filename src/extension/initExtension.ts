import * as path from "node:path";

import * as vscode from "vscode";

import { AvatarManager } from "@/avatarManager";
import { GitClient, gitClientFactory } from "@/backend/gitClient";
import { findGitRepos } from "@/backend/queries/repoSearch";
import { buildExtensionUri } from "@/backend/utils/path";
import { config } from "@/config";
import { DiffDocProvider } from "@/diffDocProvider";
import { EXTENSION_NAME } from "@/extension/constant/const";
import { createMaxDepthTracker } from "@/extension/maxDepthTracker";
import { registerMessageHandlers } from "@/extension/messageHandler";
import { createRepoManager, RepoManager } from "@/extension/repoManager";
import {
  registerRepositoryNavigator,
  repositoryPathFromCommandArgument
} from "@/extension/repoNavigator";
import { getRepositorySearchRoots } from "@/extension/repositorySearchRoots";
import { logger } from "@/extension/utils/logger";
import { WebviewBridge, webviewBridgeFactory } from "@/extension/webviewBridge";
import { createWebviewPanel, WebviewPanel } from "@/extension/webviewPanel";
import { ExtensionState } from "@/extensionState";
import { RepoFileWatcher } from "@/repoFileWatcher";
import { StatusBarItem } from "@/statusBarItem";

export type InitExtension = typeof initExtension;

function registerViewCommand(
  ctx: vscode.ExtensionContext,
  repoManager: RepoManager,
  extensionState: ExtensionState,
  avatarManager: AvatarManager,
  gitClient: GitClient,
  onRepositorySelected: (repo: string) => void
) {
  let currentPanel: WebviewPanel | undefined;
  let selectRepo: ((repo: string) => void) | undefined;

  function openGraph(repo?: string, column?: vscode.ViewColumn) {
    if (currentPanel) {
      if (repo) {
        selectRepo?.(repo);
        currentPanel.selectRepo(repo);
      }
      currentPanel.reveal(column);
      return;
    }

    const vsPanel = vscode.window.createWebviewPanel(
      "git-fleet",
      EXTENSION_NAME,
      column ?? vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          buildExtensionUri(ctx.extensionPath, "media"),
          buildExtensionUri(ctx.extensionPath, "out")
        ]
      }
    );

    let bridge!: WebviewBridge;
    const repoFileWatcher = new RepoFileWatcher(() => {
      if (vsPanel.visible) {
        bridge.post({ command: "refresh" });
      }
    });
    bridge = webviewBridgeFactory(vsPanel.webview, repoFileWatcher);
    avatarManager.registerBridge(bridge.post.bind(bridge));

    const handlers = registerMessageHandlers(bridge, {
      config,
      gitClient,
      repoManager,
      extensionState,
      avatarManager,
      repoFileWatcher,
      onRepositorySelected
    });
    selectRepo = handlers.selectRepo;
    if (repo) {
      selectRepo(repo);
    }

    currentPanel = createWebviewPanel({
      panel: vsPanel,
      bridge,
      config,
      repoFileWatcher,
      extensionPath: ctx.extensionPath,
      extensionState,
      avatarManager,
      repoManager,
      onDispose: () => {
        currentPanel = undefined;
      },
      onPanelShown: handlers.onPanelShown
    });
  }

  ctx.subscriptions.push(
    vscode.commands.registerCommand("git-fleet.view", () =>
      openGraph(undefined, vscode.window.activeTextEditor?.viewColumn)
    ),
    vscode.commands.registerCommand("git-fleet.openRepositoryGraph", (argument: unknown) => {
      const repo = repositoryPathFromCommandArgument(argument);
      if (repo) {
        openGraph(repo, currentPanel ? undefined : vscode.ViewColumn.Beside);
      }
    })
  );
}

export function initExtension(
  ctx: vscode.ExtensionContext,
  repos: string[],
  statusBarItem: StatusBarItem
) {
  try {
    logger.log(`Initializing extension with ${repos.length} repo(s)`);

    const extensionState = new ExtensionState(ctx);
    const avatarManager = new AvatarManager(config.gitPath, extensionState);

    ctx.subscriptions.push(
      vscode.commands.registerCommand("git-fleet.clearAvatarCache", () => {
        avatarManager.clearCache();
      })
    );

    const gitClient = gitClientFactory(extensionState.getLastActiveRepo() ?? "", config.gitPath());
    ctx.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(
        DiffDocProvider.scheme,
        new DiffDocProvider(gitClient.getInstance)
      )
    );

    const maxDepth = createMaxDepthTracker(config.maxDepthOfRepoSearch());
    const repoManager = createRepoManager(extensionState, statusBarItem, config);
    repoManager.setRepos(repos);
    repoManager.sendRepos();
    const rescanRepositories = async () => {
      const repoDirs = await findGitRepos(
        getRepositorySearchRoots(),
        config.gitPath(),
        config.maxDepthOfRepoSearch()
      );
      repoManager.setRepos(repoDirs);
      repoManager.sendRepos();
    };
    const navigator = registerRepositoryNavigator(
      ctx,
      repoManager,
      extensionState,
      rescanRepositories
    );
    registerViewCommand(ctx, repoManager, extensionState, avatarManager, gitClient, (repo) => {
      void navigator.revealRepository(repo);
    });

    const gitWatcher = vscode.workspace.createFileSystemWatcher("**/.git");
    ctx.subscriptions.push(
      gitWatcher,
      gitWatcher.onDidCreate((uri) => {
        const repoPath = path.dirname(uri.fsPath);
        if (repoManager.addRepo(repoPath)) {
          repoManager.sendRepos();
        }
      }),
      gitWatcher.onDidDelete((uri) => {
        const repoPath = path.dirname(uri.fsPath);
        if (repoManager.removeReposWithinFolder(repoPath)) {
          repoManager.sendRepos();
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => void rescanRepositories()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("git-fleet.showStatusBarItem")) {
          statusBarItem.refresh();
        } else if (e.affectsConfiguration("git.path")) {
          gitClient.setGitPath(config.gitPath());
        } else if (e.affectsConfiguration("git-fleet.repositorySearchRoots")) {
          void rescanRepositories();
        } else if (e.affectsConfiguration("git-fleet.maxDepthOfRepoSearch")) {
          if (maxDepth.increased(config.maxDepthOfRepoSearch())) {
            void rescanRepositories();
          }
        }
      })
    );
  } catch (err) {
    logger.log(`Error during initialization: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}
