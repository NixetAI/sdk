---
name: nixet-debug-run
description: Diagnose a failing or unexpected Nixet run. Use when an agent errors, returns the wrong output, ignores its tools, or a stream disconnects.
---

# Diagnosing a run

Read the evidence before changing anything. Every run records what it did.

## Start with the run itself

```ts
const run = await nixet.runs.retrieve(runId);

run.status;          // failed | completed | running
run.error;           // a safe reason, when it failed
run.agent_version;   // which version produced this
run.version_digest;  // the exact configuration behind that label
```

If the output is wrong but the status is `completed`, the agent did what it was
told. The instructions are the suspect, not the platform.

## Read the event log

```ts
const events = await nixet.runs.events(runId);
events.data.map((e) => `${e.sequence} ${e.type} ${e.data ?? ""}`);
```

This shows whether tools were actually called:

```
0 run.started
1 run.tool.started calculate
2 run.tool.completed calculate
3 run.output 23 times 7 is
4 run.completed
```

No `run.tool.started` means the agent never reached for the tool. That is an
instructions problem: say *"Use `calculate` for any arithmetic"* rather than
hoping it infers the intent.

## Common failures

| Symptom | Usually |
| --- | --- |
| `NotFoundError` on run | Wrong id, or a key for a different workspace |
| `404` "no published version" | Agent created without instructions |
| Tool never called | Instructions do not tell it when to use one |
| Arithmetic wrong | Same: no tool call, so it guessed |
| `PermissionError` | Key lacks `runs:write` |
| `AuthenticationError` | Key revoked, expired, or from another environment |
| Stream stops early | Client disconnected; the run continued |

## Confirming what a key can do

```ts
const identity = await nixet.whoami();
identity.environment_id;   // development | production
identity.permissions;      // what this key may do
```

An agent that "does not exist" is usually a key pointing at the other
environment. Keys are bound to one, and resources are invisible across them.

## After a change

Publish a new version rather than editing, then compare digests. If the digest
did not change, neither did the configuration, and the behaviour will not either.
