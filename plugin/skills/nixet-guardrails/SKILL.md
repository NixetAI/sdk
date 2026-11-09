---
name: nixet-guardrails
description: Inspect and rewrite what an agent is given, what it says and what its tools return. Use when the user mentions guardrails, content filtering, scrubbing or masking output, blocking topics, stopping an agent saying something, PII in responses, length limits, or checking tool results.
---

# Guardrails

A guardrail is a rule applied to text at one stage of a run. It is defined
once for the workspace and **named** by agent versions, the way MCP servers and
knowledge collections are. A rule like "never name a specific fund" applies to
every agent a customer runs, so it lives in one place.

```ts
await nixet.guardrails.create({
  name: "account-scrub",
  stage: "output",
  action: "modify",
  patterns: [{ match: "\\b\\d{12}\\b", replace: "[ACCOUNT]" }],
});

await nixet.agents.versions.create(agentId, {
  instructions: "…",
  guardrails: { output: ["account-scrub"] },
});
```

Request fields use the API's wire names (`max_characters`, `tool_result`,
`on_block`), not camelCase. The SDK passes this object through unchanged.

## Three stages

| Stage | Runs on | Typical use |
| --- | --- | --- |
| `input` | The user's message, before the model sees it | Refuse off-topic requests, strip pasted secrets |
| `output` | The agent's reply, before the caller sees it | Scrub identifiers, refuse advice it must not give |
| `tool_result` | What a tool returned | Scrub data a tool hands straight to the caller |

**`tool_result` is the one people forget, and the one that leaves a hole.** A
tool that returns structured data — rows, a component tree — can reach the
caller without passing through the agent's text, so an `output` guard never
sees it. Any agent that renders what a tool returns needs this stage.

## Four actions

| Action | On a match |
| --- | --- |
| `modify` | Rewrites the text with each pattern's `replace`, and continues |
| `block` | Stops the turn. The caller gets `message`, or an error (see `on_block`) |
| `warn` | Passes the text through unchanged and records the match |
| `allow` | Passes it through |

Prefer `modify` where it fits. "Scrub the fund name and let the rest through"
is better behaviour than refusing the whole turn. Use `warn` to introduce a
rule and watch what it catches before enforcing it.

## Two kinds: patterns or a built-in detector

**Patterns** are case-insensitive regular expressions, up to 50 per guard.
`modify` needs a `replace` on every pattern; `block` and `warn` ignore it.

```ts
await nixet.guardrails.create({
  name: "no-pasted-keys",
  stage: "input",
  action: "modify",
  patterns: [
    { match: "sk-[a-z0-9]{20,}", replace: "[KEY]" },
    { match: "ghp_[a-z0-9]{30,}", replace: "[KEY]" },
  ],
});
```

**Detectors** are behaviour the runtime already carries. Pass `detector`
instead of `patterns`:

```ts
// Personal data: names, emails, phone numbers, account identifiers
await nixet.guardrails.create({ name: "pii", stage: "output", action: "modify", detector: "pii" });

// Refuse named subjects
await nixet.guardrails.create({
  name: "no-competitors",
  stage: "output",
  action: "block",
  detector: "topics",
  topics: ["competitor pricing", "acquisition rumours"],
  message: "I can't discuss that.",
});

// Refuse text above a length
await nixet.guardrails.create({
  name: "short-input",
  stage: "input",
  action: "block",
  detector: "length",
  max_characters: 4000,
  message: "Please send a shorter message.",
});
```

There is no model-judged guard ("is this financial advice?"). A rule like that
needs a model call per turn, a different cost and latency, and is not
expressible as a pattern. Say so rather than approximating it with keywords and
calling it done.

## Binding guards to a version

```ts
await nixet.agents.versions.create(agentId, {
  instructions: "…",
  guardrails: {
    input: ["no-pasted-keys", "short-input"],
    output: ["pii", "account-scrub"],
    tool_result: ["account-scrub"],
    mode: "run_all",            // default; or "fail_fast"
    on_block: "return_message", // default; or "error"
  },
});
```

- **Order is the order given.** Under `run_all`, each guard sees the text the
  previous one produced, so several `modify` guards compose into one rewritten
  response rather than the last one winning.
- **`fail_fast`** stops at the first guard that blocks.
- **`on_block: "return_message"`** completes the run with the guard's
  `message` as the output. **`"error"`** fails the run instead, which suits a
  backend that must not show anything.
- A name that does not exist is refused at publish.

## Streaming

When a version has any `output` guard, output is **buffered** until the guards
have run, because a chunk a guard would have rewritten cannot be un-sent.
Every other event still streams as it happens. Expect `run.output` to arrive
in one piece rather than token by token on such a version.

## Changing and removing

There is no `update` and no `delete` through the API. A version pins a guard by
name, so renaming one would silently redirect what a published agent applies,
and deleting one would leave a version naming a rule that no longer exists. To
change behaviour, create a new guard and publish a version that names it.

```ts
await nixet.guardrails.list({ stage: "output" });
await nixet.guardrails.retrieve(guardrailId);
```

## What to check

| Symptom | What it means |
| --- | --- |
| `400` at publish naming a guard | No guard by that name in this environment |
| `400` creating a `modify` guard | A pattern is missing `replace` |
| Scrubbed in the reply, raw in the UI | The data came from a tool. Add the guard to `tool_result` |
| Output arrives all at once | Expected with output guards: it is buffered |
| Run completed with an odd short reply | A guard blocked and `on_block` is `return_message` |
| Two rewrites but only one applied | Check `mode`; `fail_fast` stops early |

Full signatures: [api.md](../nixet-sdk/references/api.md#guardrails).
