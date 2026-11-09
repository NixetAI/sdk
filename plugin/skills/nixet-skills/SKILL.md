---
name: nixet-skills
description: Package expertise once and share it across agents. Use when the user mentions a skill, reusable instructions, several agents needing the same knowledge, pasting the same prompt into multiple agents, or asks how to improve something in one place.
---

# Skills

A skill is **instructions plus the tools that expertise needs**, under a name,
versioned on its own.

```
skill "refund-policy" v3
  ├─ instructions   what to know and how to behave
  └─ tools          what those instructions are useless without
```

Both or neither. Instructions that say *"call `current_time` before answering
anything about dates"* do nothing for an agent that was never given
`current_time`, so the tool travels with the expertise rather than being
something each agent has to remember to attach.

## When to reach for one

The test is whether the same text would otherwise be pasted into more than one
agent. One skill serves many agents, so improving it is **one publish** rather
than an edit to every agent that had the text copied in.

A single agent's own behaviour belongs in its instructions. A skill that only
one agent will ever use is indirection with no payoff.

## Creating one

```ts
const skill = await nixet.skills.create({
  name: "research/company-lookup",   // lowercase, optionally one slash
  description: "Grounding answers in the real current date.",
  instructions: [
    "Before answering anything involving dates, call current_time.",
    "Never state today's date from memory: your training cut-off is not today.",
    "Begin the answer with the exact UTC date you read from the tool.",
  ].join("\n"),
  tools: ["current_time"],
});

skill.current_version      // "v1"
skill.version?.digest      // content hash of the frozen skill
```

Supplying `instructions` publishes `v1` in the same call. A skill with no
version cannot be referenced, so the common case should not need two calls.

The name is namespaceable with a single slash — `research/company-lookup` groups
related skills without a directory to maintain — and is **unique within a
workspace and environment**, because the name is how a version references it. A
duplicate is a `409`:

```
A skill named "research/company-lookup" already exists.
```

## Improving one

Versions are immutable, so improving a skill means publishing:

```ts
const staged = await nixet.skills.versions.create(skill.id, {
  instructions: "…revised…",
  tools: ["current_time"],
  publish: false,              // stage it
});
```

`publish: false` writes the version without moving the pointer, so agents that
named the bare skill still resolve to the old one. Promote by publishing a
version with `publish` left at its default.

Note what travels: `tools` is **per version**, not per skill. A version that
omits a tool the previous one carried is a version whose instructions may no
longer work, and nothing warns about that — the tool list is part of the frozen
content, so it is the same decision as the instructions themselves.

Unknown tool names are refused at publish rather than mid-run:

```
Unknown tools: lookup_crm
```

A skill that cannot execute should not be publishable.

## How an agent uses one

```ts
await nixet.agents.versions.create(agent.id, {
  instructions: "You are terse. Answer in one or two sentences.",
  tools: [],                                // deliberately none of its own
  skills: ["research/company-lookup@v1"],   // or a bare name
});
```

`skills` on an agent version takes `name` or `name@v2`. A bare name resolves to
whatever is published **at that moment**, and the resolved value is what gets
stored:

```ts
agent.version?.skills
// [{ name: "research/company-lookup", version: "v1", digest: "a3f1…" }]
```

## The thing to get right: pinning

**Publishing a skill version never changes an agent already running.**

Resolution happens when the *agent* version is published, never at run time. A
bare name resolving later would mean a past run could not be reproduced, so what
is recorded on the agent version is a name, a version and a digest — and at
dispatch the skill is loaded **by digest**, not by name or by the skill's
current pointer.

So the two halves live in different places:

| | lives on | changes when |
| --- | --- | --- |
| instructions, tools | the skill version | you publish a skill version |
| which version is used | the agent version | you publish an **agent** version |

This is the answer to "I improved the skill, why is my agent still behaving the
old way". It is not a cache. The agent pinned v1 and is still running v1. Publish
a new agent version to pick up v3.

To see which agent versions pinned a skill, and at which version, the console
reads it off what each version actually recorded rather than a link table —
worth knowing because that means the answer is what ran, not what a join
believes.

A skill version that has gone missing at dispatch is **skipped rather than
failing the run**: the agent still works, only with less expertise. That is a
deliberate choice and a quiet one, so if an agent seems to have lost a
capability, check the trace for the load event before assuming the model
ignored its instructions.

## How a skill's tools appear in a trace

The runtime flattens a skill's tools in with the agent's own, so by the time a
tool is called nothing downstream knows where it came from. Nixet therefore
emits the attribution itself.

Two things to look for. First, the load event, one per skill, emitted by Nixet
rather than the runtime:

```ts
for await (const event of stream) {
  if (event.category === "skill") {
    console.log(event.data, event.payload?.version, event.payload?.tools);
  }
}
```

```
research/company-lookup  v1  ["current_time"]
```

Second, `source` on every tool event:

```ts
if (event.category === "tool") {
  console.log(event.data, event.payload?.source);
}
```

```
current_time  skill:research/company-lookup
calculate     agent
```

`agent` means the version listed it directly; `skill:<name>` means a skill
lent it. This is what lets you prove an agent created with `tools: []` only
managed to call something because a skill supplied it — which is the
verification worth running once when wiring a skill up for the first time.

## Permissions

Skills reuse the agent permissions: `agents:read` to list, `agents:write` to
create or publish. Someone who may publish an agent version may also publish
the expertise it depends on.

A skill itself is never edited or deleted — `PATCH` and `DELETE` are refused
outright — because content lives in versions and agent versions may still
reference them. Correcting a skill is always a publish.

## What to check when a skill seems to do nothing

| Symptom | First thing to check |
| --- | --- |
| Agent behaves like the old version | It pinned an older skill version. Publish a new agent version |
| Agent never calls the skill's tool | Check the trace for a `skill` category load event first |
| No load event at all | The agent version's `skills` is empty, or the pinned version is gone |
| Publish refused, "Unknown tools" | A tool name the registry does not have |
| `409` on create | The name is taken in this environment |
| `400`, "has no published version" | A bare reference to a skill that was created without instructions |
| `404`, "Version v3 was not found" | `name@v3` names a version that does not exist |

Full signatures: `nixet-sdk`'s [api.md](../nixet-sdk/references/api.md). Tools
that come from an MCP server rather than the built-in registry are
`nixet-mcp`'s business, and their policy lives on the agent version, not the
skill.
