# Nixet plugin

[![Install in Claude Code](https://img.shields.io/badge/Install_in-Claude_Code-D97757?style=for-the-badge&logo=claude&logoColor=white)](#install)
[![Install in Codex](https://img.shields.io/badge/Install_in-Codex-000000?style=for-the-badge&logo=openai&logoColor=white)](#install)

Skills for building, running and debugging Nixet agents, for Claude Code and
Codex. Both read the same `skills/` and `agents/` directories; only the manifest
location differs.

## Install

**Claude Code**

```bash
claude plugin marketplace add nixetai/sdk
claude plugin install nixet@nixet
```

**Codex**

```bash
codex plugin marketplace add nixetai/sdk
codex plugin install nixet@nixet
```

Then set your key, created in the [console](https://console.nixet.ai):

```bash
export NIXET_API_KEY="nxt_…"
```

## What it adds

| Skill | Use |
| --- | --- |
| `nixet-sdk` | The SDK surface, so calls are looked up rather than guessed |
| `nixet-build-agent` | Design an agent and publish its first version |
| `nixet-run-agent` | Run one, with or without streaming |
| `nixet-debug-run` | Work out why a run behaved unexpectedly |
| `nixet-conversations` | Durable threads, on behalf of your own customers |
| `nixet-users` | The people an agent serves, not your console members |
| `nixet-memory` | What an agent retains about a person, and why |
| `nixet-redaction` | Keep personal data away from the model provider |
| `nixet-tasks` | Work that cannot finish inside a request |
| `nixet-mcp` | Give an agent your own tools, and decide what it may do with each |
| `nixet-secrets` | Credentials an agent needs, written once and never read back |
| `nixet-skills` | Package expertise once, share it across agents |
| `nixet-knowledge` | Your own documents, and why one is not searchable yet |
| `nixet-documents` | Convert PDF, Word, Excel and more to Markdown, or file them into knowledge |
| `nixet-guardrails` | Scrub or block what an agent is given, says, and gets back from tools |
| `nixet-connections` | Each end user's own credential, so an agent acts as that user |
| `nixet-variables` | Fill per-run values into instructions with `{{placeholders}}` |

And a subagent, `nixet:nixet-agent-builder`, which takes a requirement through to
a published version and a verified run.

Skills load on their own when the conversation matches their description, or you
can invoke one directly by name.

## Working on it locally

```bash
claude plugin validate ./plugin
claude --plugin-dir ./plugin
```

The skills are prose, not code, so a change takes effect in the next session
without a build step. See [CONTRIBUTING.md](CONTRIBUTING.md) for how the skills
are meant to grow as the SDK does.
