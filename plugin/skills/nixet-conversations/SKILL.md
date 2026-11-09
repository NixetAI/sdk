---
name: nixet-conversations
description: Hold a durable multi-turn conversation with a Nixet agent, on behalf of a user. Use when the user mentions chat, threads, conversation history, multi-turn, or serving their own customers.
---

# Conversations and users

A run is one exchange. A conversation is a thread that keeps its own history, so
the caller does not carry the transcript between turns.

## Register the person first

A **user** is the customer's own customer, not a console member:

```ts
const user = await nixet.users.create({
  reference: "acme_customer_8821",   // your identifier for them
  name: "Marta",
});
```

`reference` is yours. Another workspace using the same string is a different
person, and the two never see each other's data.

Attaching a user is what makes cost attributable per person, and what lets
memory follow them across threads.

## Start the thread

```ts
const conversation = await nixet.conversations.create({
  agentId: agent.id,
  userId: user.id,
});
```

The agent version is pinned now, for the thread's whole life. A conversation
that runs for weeks does not change behaviour because someone published.

Pass `agentVersion` to pin one explicitly rather than whatever is current.

## Send turns

```ts
const reply = await nixet.conversations.send(conversation.id, {
  input: "We were charged twice for September.",
});

reply.message.content   // the answer
reply.run_id            // the run behind it, for the trace
reply.cost_usd          // what this turn cost
```

History is assembled server-side, so nothing is resent. Every turn produces a
run, which is where the trace and the cost live.

## Read it back

```ts
const transcript = await nixet.conversations.messages(conversation.id);
```

Oldest first. Includes turns a summary has replaced, marked `superseded`, so
compaction does not leave holes in the history.

## Compaction

A long thread outgrows the model's context, so Nixet summarises older turns and
sends the summary in their place. It happens automatically, before the turn that
would have exceeded the budget.

The originals stay in the transcript, dimmed rather than deleted. A reader sees
what was actually said; the model sees the summary.

## Memory

Off unless asked for:

```ts
await nixet.conversations.create({
  agentId: agent.id,
  userId: user.id,
  memory: { user: true },
});
```

See the `nixet-memory` skill for what each scope keeps. Memory is **refused**
when the pinned version redacts — the agent would retain facts about
placeholders — and that combination fails with a `400`.

## What to check when a thread misbehaves

| Symptom | First thing to check |
| --- | --- |
| Behaviour changed mid-thread | It should not: the version is pinned. Check which version the runs record |
| Older turns missing from the answer | Compaction replaced them with a summary; read the transcript for what was said |
| `400` on create | Memory was requested against a redacting version |
| `400` on send | The conversation is closed |
| `502` on send | The run did not complete; retrieve it for the reason |

A failed turn still records what the person said. The assistant turn is simply
absent, so a retry does not lose their message.
