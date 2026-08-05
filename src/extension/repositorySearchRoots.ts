import * as os from "node:os";
import * as path from "node:path";

import * as vscode from "vscode";

import { config } from "@/config";

const SETTINGS_QUERY = "@ext:wgrant-dev.git-fleet repositorySearchRoots";

type SearchRootItem = vscode.QuickPickItem & { root: string };

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

function getConfiguredRepositorySearchRoots(): string[] {
  return [...new Set(config.repositorySearchRoots().map(normalizeRoot))];
}

async function saveRepositorySearchRoots(roots: string[]): Promise<void> {
  await vscode.workspace
    .getConfiguration("git-fleet")
    .update("repositorySearchRoots", roots, vscode.ConfigurationTarget.Global);
}

async function chooseRepositorySearchRoots(): Promise<boolean> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: true,
    openLabel: vscode.l10n.t("Watch for Git repositories"),
    title: vscode.l10n.t("Add folders to Git Fleet")
  });
  if (!selected?.length) {
    return false;
  }

  await saveRepositorySearchRoots([
    ...new Set([
      ...getConfiguredRepositorySearchRoots(),
      ...selected.map((uri) => normalizeRoot(uri.fsPath))
    ])
  ]);
  return true;
}

async function showRepositorySearchRootManager(): Promise<void> {
  const picker = vscode.window.createQuickPick<SearchRootItem>();
  const addButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon("folder-add"),
    tooltip: vscode.l10n.t("Add watched folders")
  };
  const editButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon("settings-gear"),
    tooltip: vscode.l10n.t("Edit paths in Settings")
  };
  const removeButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon("trash"),
    tooltip: vscode.l10n.t("Stop watching this folder")
  };

  const refreshItems = () => {
    const roots = getConfiguredRepositorySearchRoots();
    picker.items = roots.map((root) => ({
      alwaysShow: true,
      buttons: [removeButton],
      description: path.dirname(root),
      detail: root,
      iconPath: new vscode.ThemeIcon("folder"),
      label: path.basename(root),
      root
    }));
    picker.placeholder = roots.length
      ? vscode.l10n.t("Use + to add folders or the trash button to stop watching one")
      : vscode.l10n.t("No extra folders yet — use + to choose one");
  };

  picker.title = vscode.l10n.t("Git Fleet: Watched Folders");
  picker.matchOnDescription = true;
  picker.matchOnDetail = true;
  picker.buttons = [addButton, editButton];
  refreshItems();

  const disposables = [
    picker.onDidTriggerButton(async (button) => {
      if (button === addButton) {
        if (await chooseRepositorySearchRoots()) {
          refreshItems();
        }
      } else if (button === editButton) {
        picker.hide();
        await vscode.commands.executeCommand("workbench.action.openSettings", SETTINGS_QUERY);
      }
    }),
    picker.onDidTriggerItemButton(async ({ item }) => {
      await saveRepositorySearchRoots(
        getConfiguredRepositorySearchRoots().filter((root) => root !== item.root)
      );
      refreshItems();
    })
  ];

  await new Promise<void>((resolve) => {
    disposables.push(
      picker.onDidHide(() => {
        for (const disposable of disposables) {
          disposable.dispose();
        }
        picker.dispose();
        resolve();
      })
    );
    picker.show();
  });
}

export function registerRepositorySearchRootCommands(ctx: vscode.ExtensionContext): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand("git-fleet.addRepositorySearchRoot", async () => {
      await chooseRepositorySearchRoots();
    }),
    vscode.commands.registerCommand("git-fleet.openRepositorySearchRootsSettings", () =>
      showRepositorySearchRootManager()
    )
  );
}
