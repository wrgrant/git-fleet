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
  const update = vi.fn();

  return {
    ConfigurationTarget: { Global: 1 },
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
    window: { showOpenDialog: vi.fn() },
    setConfiguredRoots(roots: string[]) {
      configuredRoots = roots;
    },
    setWorkspaceRoots(roots: string[]) {
      workspaceRoots = roots;
    },
    invoke(id: string) {
      return commands.get(id)?.();
    },
    update
  };
});

vi.mock("vscode", () => mock);

beforeEach(() => {
  vi.clearAllMocks();
  mock.setConfiguredRoots([]);
  mock.setWorkspaceRoots([]);
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
});
