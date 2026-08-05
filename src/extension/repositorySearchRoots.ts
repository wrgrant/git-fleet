import * as os from "node:os";
import * as path from "node:path";

import * as vscode from "vscode";

import { config } from "@/config";

const SETTINGS_QUERY = "@ext:wgrant-dev.git-fleet repositorySearchRoots";

function normalizeRoot(root: string): string {
  const expanded =
    root === "~"
      ? os.homedir()
      : root.startsWith(`~${path.sep}`)
        ? path.join(os.homedir(), root.slice(2))
        : root;
  return path.resolve(expanded);
}

export function getRepositorySearchRoots(): string[] {
  const workspaceRoots = (vscode.workspace.workspaceFolders ?? []).map(
    (folder) => folder.uri.fsPath
  );
  return [...new Set([...workspaceRoots, ...config.repositorySearchRoots()].map(normalizeRoot))];
}

export function registerRepositorySearchRootCommands(ctx: vscode.ExtensionContext): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand("git-fleet.addRepositorySearchRoot", async () => {
      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: true,
        openLabel: "Watch for Git repositories",
        title: "Add Git Fleet Search Root"
      });
      if (!selected?.length) {
        return;
      }

      const roots = [
        ...new Set(
          [...config.repositorySearchRoots(), ...selected.map((uri) => uri.fsPath)].map(
            normalizeRoot
          )
        )
      ];
      await vscode.workspace
        .getConfiguration("git-fleet")
        .update("repositorySearchRoots", roots, vscode.ConfigurationTarget.Global);
    }),
    vscode.commands.registerCommand("git-fleet.openRepositorySearchRootsSettings", () =>
      vscode.commands.executeCommand("workbench.action.openSettings", SETTINGS_QUERY)
    )
  );
}
