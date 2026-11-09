# Security policy

## Reporting a vulnerability

Please do not report security issues in public issues or discussions.

Email **shubham@nixet.ai** with:

- a description of the issue and its impact,
- steps to reproduce, or a proof of concept,
- the SDK version and runtime (Node, Deno, Bun, browser) you used.

We acknowledge reports within three business days and keep you informed until
the issue is resolved. We ask that you give us reasonable time to fix an issue
before disclosing it.

## Supported versions

Security fixes are released for the latest minor version of `@nixet/sdk`.

## Handling credentials

- Keep API keys on a server. Never ship one in browser or mobile code, where
  anyone can read it.
- Pass keys through `NIXET_API_KEY` or a secret manager rather than committing
  them to source control.
- Secret values, MCP connection credentials and document passwords are
  write-only: the API never returns them, and this SDK never logs them.
- If a key is exposed, revoke it in the [console](https://console.nixet.ai)
  and issue a new one.
