---
name: nixet-build-agent
description: Create a Nixet agent and publish its first version. Use when the user asks to build, create, or scaffold an agent, or mentions Nixet agents, instructions, tools or model tiers.
---

# Building a Nixet agent

An agent is an identity; its behaviour lives in immutable versions. Creating one
means writing a version, so decide the configuration before calling the API.

## Before writing code

Establish four things. Ask only about what the user has not already said.

| | |
| --- | --- |
| **Purpose** | What the agent does, in one sentence |
| **Instructions** | The system prompt. Specific beats clever |
| **Model** | A managed tier, or the user's own provider |
| **Tools** | Only what it needs. `calculate`, `current_time` |

## Creating it

```ts
import { Nixet } from "@nixet/sdk";

const nixet = new Nixet();   // reads NIXET_API_KEY

const agent = await nixet.agents.create({
  name: "Support Assistant",
  description: "Answers product questions.",
  instructions: "You are concise. Cite the documentation when you can.",
  model: { provider: "nix", tier: "balanced" },
  tools: ["calculate"],
});
```

One call creates the identity and publishes `v1`. Omitting `instructions`
creates an identity that cannot run yet, which is rarely what someone wants.

## Choosing a model

The managed provider needs no key of the user's own:

| Tier | For |
| --- | --- |
| `fast` | Short, straightforward work |
| `balanced` | The default |
| `powerful` | Harder reasoning, longer context |

To name a specific model, the user must bring their own provider key:

```ts
model: { provider: "openai", model: "gpt-4o-mini" }
model: { provider: "anthropic", model: "claude-sonnet-4-20250514" }
```

`tier` exists only on `nix`, and `model` is required on the others. The types
enforce this, so a wrong combination fails to compile.

## Writing instructions

Instructions are the agent. Weak instructions cannot be fixed by a better model.

- State the job, then the constraints: *"Answer support questions. If the docs do
  not cover it, say so rather than guessing."*
- Name when to use a tool: *"Use `calculate` for any arithmetic."* Without this,
  an agent often does mental arithmetic and gets it wrong.
- Say what not to do, if it matters: *"Never quote prices."*

## Changing an agent later

Versions are immutable, so publish a new one:

```ts
await nixet.agents.versions.create(agent.id, {
  instructions: "…revised…",
});
```

Numbered in order, and the published version becomes the default for new runs.
Pass `publish: false` to stage a change without sending traffic to it.

## Checks worth making

- An unknown tool name is rejected when the version publishes, not mid-run. If
  the user names a tool, confirm it exists rather than assuming.
- `agent.version.digest` is the hash of the frozen configuration. Worth showing
  the user, because every run records it.
- A version naming an MCP server can refuse to publish for a reason nobody
  typed: a `destructive` tool takes `ask` by default, which is not yet
  enforceable. See `nixet-mcp`.
