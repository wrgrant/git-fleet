# Contributing to Git Fleet

Thanks for helping make multi-repository Git work easier to understand.

## Before opening a change

Open an issue for behavior changes that affect repository discovery, Git mutations, worktree inference, or the extension identity. Small fixes and tests can go directly to a pull request.

## Local verification

```sh
pnpm install
pnpm run format
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run test:ext
pnpm run package
```

Keep the repository navigator compact and navigational. Git mutations should remain in a surface that makes their repository and history context obvious.

All contributions are accepted under the repository's [MIT License](LICENSE). Preserve upstream attribution when moving or substantially rewriting inherited code.
