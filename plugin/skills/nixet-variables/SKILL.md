---
name: nixet-variables
description: Fill per-run values into an agent's instructions with {{placeholders}}. Use when the user mentions templating the system prompt, injecting customer or account context into instructions, per-request prompt values, dynamic instructions, or {{variables}}.
---

# Variables

A version can declare `{{placeholders}}` in its instructions, and each run
supplies the values. One version then serves every customer, with each run's
context filled in — no version per customer, and no string-building of prompts
in your backend.

```ts
await nixet.agents.versions.create(agentId, {
  instructions:
    "You help {{customer_name}}, who is on the {{plan}} plan. " +
    "Answer only about features their plan includes.",
  variables: ["customer_name", "plan"],
});

const run = await nixet.runs.create(agentId, {
  input: "Can I export to CSV?",
  variables: { customer_name: "Sam", plan: "Pro" },
});

run.variables;   // { customer_name: "Sam", plan: "Pro" }
```

## Declared, not inferred, and checked at publish

`variables` must list exactly the placeholders the instructions use:

- A placeholder used but not declared is **refused at publish**.
- A variable declared but not used is **refused at publish**.

Both are mistakes, and because a version is immutable, publish is the only
cheap time to catch them. Names start with a lowercase letter and hold lowercase
letters, numbers and underscores, up to 64 characters.

## A run must supply all of them, and nothing else

- Every declared variable is required. A missing one is refused with a `400`
  before a run is created.
- An **unknown key is refused** the same way, not ignored.

The second rule is a security property. If a run could fill any slot it liked,
your own backend would become a prompt-injection surface: anyone able to shape
a request could write into the system prompt. Declaring variables on the
version is what limits a run to the slots the version named.

Values are inserted as text. They are still part of the system prompt, so do
not pass untrusted end-user input as a variable value without thinking about
what it could say — put user-written text in `input` instead.

## Recorded on the run

The values a run received are stored on it as `run.variables`. Without them,
the exact prompt an agent was given would be unrecoverable later. When
debugging "why did it say that", read the run's variables alongside its
version's instructions.

A version with no variables has `run.variables === null`.

## With agents.create

```ts
await nixet.agents.create({
  name: "Account Assistant",
  instructions: "You help {{customer_name}}.",
  variables: ["customer_name"],
});
```

## Tasks and conversations

Only `runs.create` and `runs.stream` accept `variables`. Tasks and conversation
messages cannot supply them yet, so run a version that declares variables with
`runs.create` or `runs.stream`. Say so plainly rather than adding a field the
API will refuse.

## Variables or memory?

| Want | Use |
| --- | --- |
| Context your backend already knows, every run (name, plan, locale) | Variables |
| Facts learned during conversations (preferences, history) | Memory — see `nixet-memory` |
| Large reference material | Knowledge — see `nixet-knowledge` |

## What to check

| Symptom | What it means |
| --- | --- |
| `400` at publish naming a placeholder | Used but not in `variables`, or declared but unused |
| `400` on a run naming a variable | Missing a declared value, or an unknown key |
| Agent ignores the value | Check `run.variables` and the version's instructions; the placeholder may be in a different version |
| `run.variables` is null | The version declares none |

Full signatures: [api.md](../nixet-sdk/references/api.md#agentsversions).
