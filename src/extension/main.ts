import * as vscode from "vscode";

import { findGitRepos } from "@/backend/queries/repoSearch";
import { getGitVersion } from "@/backend/utils/git";
import { config } from "@/config";
import { initExtension } from "@/extension/initExtension";
import {
  getRepositorySearchRoots,
  registerRepositorySearchRootCommands
} from "@/extension/repositorySearchRoots";
import { logger } from "@/extension/utils/logger";
import { watchForRepos } from "@/extension/watchForRepos";
import { StatusBarItem } from "@/statusBarItem";

export async function activate(ctx: vscode.ExtensionContext) {
  logger.init(ctx);
  logger.log("Starting Git Fleet ...");

  const gitPath = config.gitPath();
  const gitVersion = await getGitVersion(gitPath);
  if (gitVersion) {
    logger.log(`Using git (version: ${gitVersion})`);
  } else {
    logger.log("Failed to detect git version");
  }

  const statusBarItem = new StatusBarItem(ctx, config);
  statusBarItem.refresh();
  registerRepositorySearchRootCommands(ctx);

  const paths = getRepositorySearchRoots();
  logger.log(`Searching ${paths.length} configured root(s) for repositories ...`);
  const repoDirs = await findGitRepos(paths, gitPath, config.maxDepthOfRepoSearch());

  if (repoDirs.length > 0) {
    logger.log(`Found ${repoDirs.length} repo(s)`);
    initExtension(ctx, repoDirs, statusBarItem);
    logger.log("Started Git Fleet - Ready to use!");
    return;
  }

  logger.log("No repos found");
  logger.log("Watching for new repos ...");
  ctx.subscriptions.push(watchForRepos(ctx, initExtension, statusBarItem));
}

export function deactivate() {}
