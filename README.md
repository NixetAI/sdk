# Nixet SDK

[![npm install @nixet/sdk](https://img.shields.io/npm/v/@nixet/sdk?style=for-the-badge&logo=npm&label=npm%20install%20%40nixet%2Fsdk&color=CB3837)](https://www.npmjs.com/package/@nixet/sdk)
[![Install in Claude Code](https://img.shields.io/badge/Install_in-Claude_Code-D97757?style=for-the-badge&logo=claude&logoColor=white)](#claude-code-and-codex-plugin)
[![Install in Codex](https://img.shields.io/badge/Install_in-Codex-000000?style=for-the-badge&logo=openai&logoColor=white)](#claude-code-and-codex-plugin)
[![MIT license](https://img.shields.io/npm/l/@nixet/sdk?style=for-the-badge)](./LICENSE)

Official TypeScript SDK and editor plugin for [Nixet](https://nixet.ai), the API
for building, running and inspecting AI agents.

| Package | Description | |
| --- | --- | --- |
| [`@nixet/sdk`](./packages/sdk) | TypeScript and JavaScript client for the Nixet API | [![npm](https://img.shields.io/npm/v/@nixet/sdk.svg)](https://www.npmjs.com/package/@nixet/sdk) |
| [`@nixet/contracts`](./packages/contracts) | Request, response and event schemas, as Zod schemas and types | [![npm](https://img.shields.io/npm/v/@nixet/contracts.svg)](https://www.npmjs.com/package/@nixet/contracts) |
| [Nixet plugin](./plugin) | Skills for Claude Code and Codex | |

## Quick start

```bash
npm install @nixet/sdk
```

```ts
import { Nixet } from "@nixet/sdk";

const nixet = new Nixet(); // reads NIXET_API_KEY

const agent = await nixet.agents.create({
  name: "Support Assistant",
  instructions: "You are concise. Use tools for arithmetic.",
  tools: ["calculate"],
});

const run = await nixet.runs.create(agent.id, { input: "What is 23 × 7?" });
console.log(run.output);
```

Create an API key in the [Nixet console](https://console.nixet.ai).

- [SDK guide](./packages/sdk/README.md): every feature, with examples
- [API reference](./packages/sdk/api.md): every method, request and type
- [Changelog](./packages/sdk/CHANGELOG.md)

## Claude Code and Codex plugin

Teaches your coding agent the Nixet SDK, so it builds, runs and debugs agents
with real calls rather than guesses.

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

See [plugin/README.md](./plugin/README.md) for the skills it adds.

## Repository layout

```text
packages/sdk/          @nixet/sdk
packages/contracts/    @nixet/contracts
plugin/                Claude Code and Codex plugin
.claude-plugin/        Claude Code marketplace manifest
.codex-plugin/         Codex marketplace manifest
```

## Contributing and security

Issues are welcome; see [CONTRIBUTING.md](./CONTRIBUTING.md). Report
vulnerabilities privately as described in [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)
