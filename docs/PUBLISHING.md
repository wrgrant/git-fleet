# Publishing Git Fleet

GitHub Releases are the first distribution channel. Marketplace publishing is intentionally a separate, manual decision.

## GitHub release

1. Confirm `package.json` version, `CHANGELOG.md`, screenshots, and release notes.
2. Run `pnpm run format`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, and `pnpm run package`.
3. Package locally with `pnpm dlx @vscode/vsce package --no-dependencies --out git-fleet-vX.Y.Z.vsix`. Runtime dependencies are bundled by esbuild.
4. Install that exact VSIX into stable VS Code and smoke-test repository discovery, the Activity Bar view, working changes, worktrees, and Git actions.
5. Tag the verified commit as `vX.Y.Z` and push the tag. The release workflow packages a VSIX and attaches it to a GitHub release.

## First VS Code Marketplace release

1. Create the Marketplace publisher `wgrant-dev` and verify its public profile.
2. Verify that `package.json` still declares publisher `wgrant-dev`, name `git-fleet`, and a unique version. The resulting extension ID is `wgrant-dev.git-fleet`.
3. Review the listing copy, icon, screenshots, repository link, license, privacy implications, and support links in a packaged VSIX.
4. Upload the already-tested VSIX through the [Marketplace publisher management page](https://marketplace.visualstudio.com/manage/publishers/). VS Code officially supports this manual route, and it keeps the first release independent from a long-lived publishing credential.
5. Verify installation from a clean VS Code profile and confirm updates resolve from the new ID.
6. Only after the manual flow is stable, add a separately approved automated publish job. Follow the current [VS Code publishing documentation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension); Microsoft has announced retirement of global Azure DevOps PATs on December 1, 2026, so prefer the documented Microsoft Entra ID flow instead of designing new automation around a global PAT.

## Open VSX

Open VSX uses a separate namespace and token. Claim the `wgrant-dev` namespace, verify ownership, and publish the same already-tested VSIX with `ovsx`. Do not make Marketplace and Open VSX publishing part of the GitHub release job until both identities and recovery procedures are confirmed.

## Identity invariants

- GitHub repository: `wrgrant/git-fleet`
- Marketplace publisher: `wgrant-dev`
- Package name: `git-fleet`
- Extension ID: `wgrant-dev.git-fleet`
- Command, view, and setting namespace: `git-fleet`
- Activity Bar view container ID: `git-fleet`

Changing the publisher or package name after release creates a different extension identity and breaks automatic updates, so treat both values as permanent.
