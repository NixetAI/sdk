# Contributing

Thanks for your interest in the Nixet SDK.

This repository is published from Nixet's internal source, so pull requests are
not merged directly. They are still welcome as a way to show a fix: we apply
the change upstream and it appears here in the next release, with credit.

The most useful contributions are:

- **Bug reports.** Open an issue with the SDK version, your runtime, a minimal
  reproduction, and the `requestId` from the error if there was one.
- **Documentation fixes.** Anything in a README, `api.md` or a plugin skill
  that is wrong, unclear or missing.
- **Plugin skills.** Corrections to what the Claude Code and Codex plugin
  tells your coding agent.

## Building locally

```bash
npm install
npm run build
```

`packages/contracts` builds first, since the SDK depends on its types.

## Security

Please report vulnerabilities privately, as described in
[SECURITY.md](./SECURITY.md), not in an issue.
