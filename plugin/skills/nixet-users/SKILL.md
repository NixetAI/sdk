---
name: nixet-users
description: Register the people a Nixet agent serves, so cost and memory attach to a person. Use when the user mentions their own customers, end users, per-user isolation, who an agent is talking to, attributing cost to a customer, or confuses a user with a console member.
---

# Users

A **user** is the customer's own customer.

```
Nixet member   signs into the console, reads traces, issues keys
Nixet user     the person Acme's agent is talking to
```

These are not the same thing and the API does not pretend they are. Most
platforms model one notion of "user" and then discover that a B2B customer's
end users need isolation the console's login never gave them. Get this wrong in
conversation and everything downstream — memory, cost attribution, erasure — is
explained wrongly too.

Nothing about a user is authentication. Registering one does not create a
login, a session or a credential. It creates a thing an agent's work can be
attributed to.

## Registering one

```ts
const user = await nixet.users.create({
  reference: "acme_customer_8821",   // your identifier for them
  name: "Marta",
  email: "marta@example.com",
  metadata: { plan: "growth" },
});
```

`reference` is **yours**, opaque to Nixet, and the only required field. It is
how you look a person up without storing our id alongside your own:

```ts
const found = await nixet.users.list({ reference: "acme_customer_8821" });
```

`email`, `name` and `metadata` are optional so you can keep personal data out
of Nixet entirely — and so they can be erased without breaking the reference
your systems depend on. Keep personal data out of the reference itself for the
same reason.

## Isolation is per workspace, so a reference is not global

```
Acme's   workspace, reference "user_8821"   →  one person
Globex's workspace, reference "user_8821"   →  a different person
```

The uniqueness constraint is on the scope plus the reference, not the reference
alone, and every read is scoped. Two customers naming a person `user_8821` are
naming different people, and neither can resolve the other's. A duplicate
within one workspace is a `409`:

```
A user with reference "acme_customer_8821" already exists.
```

Environments are part of that scope too, so a development user and a
production user with the same reference are separate rows.

## What attaching a user actually buys you

Three things, and they are the reason to bother:

**Memory follows the person.** A `user`-scoped memory requires a `userId`, so
memory across threads is only possible once a person exists to attach it to.
See `nixet-memory`.

**Cost is attributable per person.** `user_id` is on the run row, so what one
of your customers cost is a sum over their runs rather than a guess:

```ts
const run = await nixet.runs.create(agent.id, { input: "…" });
run.cost_usd
```

The console's user detail page reports runs, cost and tokens totalled **across
every conversation** — one person may talk to several agents, so what they cost
is the total rather than one thread's share of it. That total is summed from
runs rather than held on a counter, so it cannot drift from what it describes.

**Conversations belong to someone.** A thread with no user is a thread with no
one to remember, and no one to attribute.

## Attaching one

The `userId` is passed where work is created, not configured on the agent:

```ts
await nixet.conversations.create({ agentId: agent.id, userId: user.id });
await nixet.tasks.create({ agentId: agent.id, input: "…", userId: user.id });

await nixet.memory.create({
  scope: "user",
  agentId: agent.id,
  userId: user.id,
  content: "Prefers refunds to the original payment method.",
});
```

`nixet.runs.create` does **not** take `userId` in the SDK — its params are
`input`, `version`, `provider` and `sessionId`. The API's run payload accepts a
`user_id` and the SDK has not caught up, so attribute a single-shot run by
creating it inside a conversation, or say plainly that the SDK does not expose
it rather than writing a parameter that will be dropped.

## The user is not the credential

This catches people. An API key identifies the **integration**, not one of its
users. A run records the key's subject as its creator and the user separately as
who it was for, because sending the key's subject as the identity would give
every one of a customer's users the same one — and memory isolated by identity
would then not be isolated at all.

So: one API key, many users. Never one key per end user.

## What does not exist yet

Be straight about this when asked:

- **No update.** `PATCH` and `PUT` are refused outright. Correcting a name
  means the field cannot currently be changed through the API.
- **No delete.** Erasure needs to remove conversations, messages and memory
  together in one transaction, so it is a route with a transaction rather than a
  bare row delete — and that route is not built. `nixet.memory.delete` is what
  currently serves a request to forget what an agent knows about a person, and
  `nixet.knowledge.sources.del` what removes a document.
- **No console registration.** Reading users in the console is read-only;
  creating one stays API-only.

`nixet.users` is therefore `create`, `retrieve` and `list`, and nothing else.

## Permissions

`users:read` to list and retrieve, `users:write` to create. Both are in the
standard preset; only `users:read` is in the read-only one.

## What to check when attribution looks wrong

| Symptom | First thing to check |
| --- | --- |
| Cost not attributed to a person | The run has no `user_id`. A bare `runs.create` cannot set one |
| `409` on create | The reference is taken **in this environment** |
| `404` retrieving a user that exists | Wrong environment, or another workspace's id |
| Memory not isolated per person | Every memory call needs the `userId`, not just the conversation |
| `400` on a `user`-scoped memory | Scope `user` without a `userId` |
| Two people sharing memory | One reference used for both, or the key's subject used as identity |

Full signatures: `nixet-sdk`'s [api.md](../nixet-sdk/references/api.md).
