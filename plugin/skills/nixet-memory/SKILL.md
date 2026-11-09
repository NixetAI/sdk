---
name: nixet-memory
description: Give a Nixet agent memory of the people it serves, and inspect or correct what it retained. Use when the user mentions memory, remembering a customer, personalisation across conversations, or asks why an agent knows or forgot something.
---

# Memory

A conversation remembers what was said in it. Memory is different: it is what an
agent retains **about a person**, and it survives every thread they ever have.

Recall is semantic, so `"what do they prefer?"` finds `"I like metric units"`
without sharing a word with it.

Nothing is retained unless a conversation asks for it.

## Turning it on

Retention is a property of the conversation, not the agent:

```ts
const conversation = await nixet.conversations.create({
  agentId: agent.id,
  userId: user.id,
  memory: { user: true },   // facts about this person
});
```

| scope | Keeps |
| --- | --- |
| `conversation` | Facts within this thread only |
| `user` | Facts about this person, across every thread |
| `agent` | Facts shared by every user of the agent |

All default to off. An agent must not retain information because nobody
remembered to switch it off.

Extraction runs after the reply is sent, so a fact is not visible the instant
the turn returns.

## Writing a fact directly

For something already known — a plan tier, an account setting — rather than
waiting for it to be said:

```ts
await nixet.memory.create({
  scope: "user",
  agentId: agent.id,
  userId: user.id,
  content: "Prefers refunds to the original payment method.",
});
```

A scope names what the memory is about, so the thing it is about has to be
present: `user` requires `userId`, `conversation` requires `conversationId`.
Omitting one is a `400`, not a silently wider memory.

## Reading it back

```ts
const facts = await nixet.memory.search({
  query: "how do they want refunds handled?",
  agentId: agent.id,
  userId: user.id,
});

const everything = await nixet.memory.list({ agentId: agent.id, userId: user.id });
```

`search` asks a question; `list` asks for the lot, newest first.

## When a fact changes

The store adds rather than overwrites, so a changed fact arrives **beside** the
old one:

```ts
facts[0]  // { content: "On the Enterprise plan", superseded: false }
facts[1]  // { content: "On the Growth plan", superseded: true, superseded_by: "mem_…" }
```

Only the current fact reaches the model. The older one is marked, not deleted,
so a reader can see what changed and when.

When showing memory, group a fact with what it replaced rather than listing both
as equals — otherwise an agent appears to believe two contradictory things.

## Correcting and forgetting

```ts
await nixet.memory.update(memoryId, { agentId: agent.id, content: "…" });
await nixet.memory.delete(memoryId, { agentId: agent.id, userId: user.id });
```

`delete` is the only way to remove what an agent knows about a person, so it is
what an erasure request is served by.

## Memory and redaction do not mix

A version that redacts masks the input before dispatch, so the runtime only ever
sees `[GIVEN_NAME_1]`. An agent with memory enabled would retain a fact about a
placeholder — useless immediately, and unrecoverable once the map expires.

Creating a conversation with both fails with a `400`. That is deliberate.
Choose: a version that redacts, or a conversation that remembers.

## What to check when memory seems wrong

| Symptom | First thing to check |
| --- | --- |
| Nothing retained | Was `memory` set on the conversation? It is off by default |
| Nothing retained yet | Extraction runs after the reply; give it a moment |
| Agent quotes something stale | Read the facts: a superseded one is still visible to a reader, not to the model |
| `400` on create | A `user` or `conversation` scope without its id |
| `503` | Memory is not configured for that deployment |

Do not claim a fact was stored without reading it back. Extraction is a model
call, and a short or ambiguous turn may yield nothing.
