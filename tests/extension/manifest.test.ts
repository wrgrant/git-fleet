import * as fs from "node:fs";

import { describe, expect, it } from "vitest";

type ExtensionManifest = {
  contributes: {
    viewsContainers: { activitybar: { id: string }[] };
    views: Record<string, unknown>;
  };
};

const manifest = JSON.parse(
  fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")
) as ExtensionManifest;

describe("extension manifest", () => {
  it("uses VS Code-compatible Activity Bar container IDs", () => {
    for (const container of manifest.contributes.viewsContainers.activitybar) {
      expect(container.id).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(manifest.contributes.views).toHaveProperty(container.id);
    }
  });
});
