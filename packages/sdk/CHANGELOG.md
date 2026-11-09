# Changelog

All notable changes to `@nixet/sdk` are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). Until 1.0.0, a minor version may
contain breaking changes; they are always listed under **Changed**.

## [0.1.2] — 2026-11-10

### Changed

- The public source moved to [github.com/nixetai/sdk](https://github.com/nixetai/sdk).
  The `repository` and `bugs` links and the plugin install commands point
  there. 0.1.1 linked to the previous location, which redirects.

### Added

- Install buttons for npm, Claude Code and Codex at the top of the README.
- The plugin section lists its new skills: per-user connections, guardrails,
  variables and document conversion.

## [0.1.1] — 2026-11-10

### Added

- Full README covering every resource, with examples.
- `api.md`: every method, its HTTP request, parameters and return type.
- `CHANGELOG.md` and `SECURITY.md`.
- A section on installing the Nixet plugin for Claude Code and Codex.
- `repository` and `bugs` links to the public source.

### Fixed

- `guardrails.create` no longer requires `patterns` and `topics` when they do not apply. It now takes `CreateGuardrailParams`, the request type, rather than the parsed one.
- Corrected a comment that said `versions.create` could not name knowledge
  collections; `knowledgeCollections` has been supported since 0.1.0.

## [0.1.0] — 2026-11-09

First public release.

### Added

- `Nixet` client with API-key authentication, configurable base URL, timeout,
  retries and `fetch`.
- Agents and immutable versions: instructions, models, built-in tools, skills,
  MCP servers, tool policies, knowledge collections, variables, guardrails and
  redaction.
- Runs: synchronous, streaming (`RunStream`) and the recorded event log, with
  resume by sequence number.
- Tasks with `wait`, `cancel` and `retry`.
- Users, conversations and memory.
- Skills and skill versions.
- Knowledge collections and sources.
- Document conversion to Markdown, including password-protected PDFs.
- MCP servers, discovered tools and per-user connections.
- Workspace guardrails.
- Write-only secrets.
- Typed errors per HTTP status, with automatic retries for connection
  failures, rate limits and server errors.
- ESM and CommonJS builds with TypeScript declarations.

[0.1.1]: https://www.npmjs.com/package/@nixet/sdk/v/0.1.1
[0.1.0]: https://www.npmjs.com/package/@nixet/sdk/v/0.1.0
