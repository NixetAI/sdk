# Nixet SDK

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
claude plugin marketplace add nixetio/nixet-sdk
claude plugin install nixet@nixet
```

**Codex**

```bash
codex plugin marketplace add nixetio/nixet-sdk
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
