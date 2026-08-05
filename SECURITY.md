# Security policy

Please do not open a public issue for a suspected vulnerability or exposed credential. Use GitHub's private vulnerability reporting for `wrgrant/git-fleet` when it is available, or contact the maintainer through [wgrant.dev](https://wgrant.dev).

Git Fleet runs Git commands against local repositories and can expose Git actions that change repository state. Review the selected repository and command before confirming a mutation. Avatar fetching is disabled by default because enabling it sends commit email-derived lookup data to external avatar services.

Only the latest Git Fleet release receives security fixes.
