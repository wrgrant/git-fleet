import * as path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getRepositorySearchRoots,
  registerRepositorySearchRootCommands
} from "@/extension/repositorySearchRoots";

const mock = vi.hoisted(() => {
  let configuredRoots: string[] = [];
  let workspaceRoots: string[] = [];
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  const update = vi.fn((_key: string, value: string[]) => {
    configuredRoots = value;
  });
  const topButtonListeners: Array<(button: unknown) => unknown> = [];
  const itemButtonListeners: Array<(event: { item: unknown }) => unknown> = [];
  const hideListeners: Array<() => unknown> = [];
  const quickPick = {
    buttons: [] as unknown[],
    items: [] as unknown[],
    placeholder: "",
    title: "",
    matchOnDescription: false,
    matchOnDetail: false,
    dispose: vi.fn(),
    hide: vi.fn(() => hideListeners.forEach((listener) => listener())),
    show: vi.fn(),
    onDidHide: (listener: () => unknown) => {
      hideListeners.push(listener);
      return { dispose: vi.fn() };
    },
    onDidTriggerButton: (listener: (button: unknown) => unknown) => {
      topButtonListeners.push(listener);
      return { dispose: vi.fn() };
    },
    onDidTriggerItemButton: (listener: (event: { item: unknown }) => unknown) => {
      itemButtonListeners.push(listener);
      return { dispose: vi.fn() };
    }
  };

  return {
    ConfigurationTarget: { Global: 1 },
    ThemeIcon: class ThemeIcon {
      constructor(public readonly id: string) {}
    },
    l10n: { t: (value: string) => value },
    Uri: { file: (fsPath: string) => ({ fsPath }) },
    commands: {
      executeCommand: vi.fn(),
      registerCommand: (id: string, command: (...args: unknown[]) => unknown) => {
        commands.set(id, command);
        return { dispose: vi.fn() };
      }
    },
    workspace: {
      get workspaceFolders() {
        return workspaceRoots.map((fsPath) => ({ uri: { fsPath } }));
      },
      getConfiguration: () => ({
        get: (key: string, defaultValue: unknown) =>
          key === "repositorySearchRoots" ? configuredRoots : defaultValue,
        update
      })
    },
    window: { createQuickPick: vi.fn(() => quickPick), showOpenDialog: vi.fn() },
    setConfiguredRoots(roots: string[]) {
      configuredRoots = roots;
    },
    setWorkspaceRoots(roots: string[]) {
      workspaceRoots = roots;
    },
    invoke(id: string) {
      return commands.get(id)?.();
    },
    quickPick,
    async triggerTopButton(index: number) {
      await topButtonListeners[0]?.(quickPick.buttons[index]);
    },
    async triggerItemButton(index: number) {
      await itemButtonListeners[0]?.({ item: quickPick.items[index] });
    },
    update
  };
});

vi.mock("vscode", () => mock);

beforeEach(() => {
  vi.clearAllMocks();
  mock.setConfiguredRoots([]);
  mock.setWorkspaceRoots([]);
  mock.quickPick.items = [];
});

describe("repository search roots", () => {
  it("combines workspace and configured roots without duplicates", () => {
    const root = path.resolve("/repos");
    mock.setWorkspaceRoots([root]);
    mock.setConfiguredRoots([root, "/archive"]);

    expect(getRepositorySearchRoots()).toEqual([root, path.resolve("/archive")]);
  });

  it("stores folders selected through the add-root command globally", async () => {
    const ctx = { subscriptions: [] } as unknown as import("vscode").ExtensionContext;
    mock.setConfiguredRoots(["/repos"]);
    mock.window.showOpenDialog.mockResolvedValue([{ fsPath: "/archive" }]);
    registerRepositorySearchRootCommands(ctx);

    await mock.invoke("git-fleet.addRepositorySearchRoot");

    expect(mock.update).toHaveBeenCalledWith(
      "repositorySearchRoots",
      [path.resolve("/repos"), path.resolve("/archive")],
      mock.ConfigurationTarget.Global
    );
  });

  it("manages watched folders with native add and remove controls", async () => {
    const ctx = { subscriptions: [] } as unknown as import("vscode").ExtensionContext;
    mock.setConfiguredRoots(["/repos"]);
    mock.window.showOpenDialog.mockResolvedValue([{ fsPath: "/archive" }]);
    registerRepositorySearchRootCommands(ctx);

    const manager = mock.invoke("git-fleet.openRepositorySearchRootsSettings");
    expect(mock.quickPick.title).toBe("Git Fleet: Watched Folders");
    expect(mock.quickPick.items).toHaveLength(1);

    await mock.triggerTopButton(0);
    expect(mock.update).toHaveBeenCalledWith(
      "repositorySearchRoots",
      [path.resolve("/repos"), path.resolve("/archive")],
      mock.ConfigurationTarget.Global
    );
    expect(mock.quickPick.items).toHaveLength(2);

    await mock.triggerItemButton(0);
    expect(mock.update).toHaveBeenLastCalledWith(
      "repositorySearchRoots",
      [path.resolve("/archive")],
      mock.ConfigurationTarget.Global
    );

    mock.quickPick.hide();
    await manager;
  });
});
