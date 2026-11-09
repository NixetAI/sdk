---
name: nixet-sdk
description: Reference for the Nixet SDK surface. Use when writing any Nixet code, to confirm which resources and methods exist rather than guessing at an API shape.
---

# The Nixet SDK

`@nixet/sdk` follows one shape throughout:

```ts
nixet.<resource>.<verb>(...)
nixet.<resource>.<subresource>.<verb>(...)
```

So a resource added later is reachable without learning a new convention. If a
method is not listed in `references/api.md`, it does not exist yet — say so
rather than inventing a plausible call.

## Setup

```ts
import { Nixet } from "@nixet/sdk";

const nixet = new Nixet();   // reads NIXET_API_KEY
```

A key is bound to one workspace and environment, so nothing else is configured.
`baseURL`, `timeout` and `maxRetries` are available when needed.

## What exists today

| Resource | Verbs |
| --- | --- |
| `nixet.whoami()` | — |
| `nixet.agents` | `create` `retrieve` `list` |
| `nixet.agents.versions` | `create` `retrieve` `list` |
| `nixet.runs` | `create` `stream` `retrieve` `list` `events` |
| `nixet.skills` | `create` `retrieve` `list` |
| `nixet.skills.versions` | `create` `list` |
| `nixet.conversations` | `create` `retrieve` `list` `send` `messages` |
| `nixet.users` | `create` `retrieve` `list` |
| `nixet.memory` | `create` `search` `list` `get` `update` `delete` |
| `nixet.tasks` | `create` `retrieve` `list` `cancel` `retry` `resume` `wait` |
| `nixet.secrets` | `create` `retrieve` `list` `update` `del` |
| `nixet.mcpServers` | `create` `retrieve` `list` `update` `del` |
| `nixet.tools` | `retrieve` `list` — read-only; discovered, not authored |
| `nixet.knowledge.collections` | `create` `retrieve` `list` `del` — no `update` |
| `nixet.knowledge.sources` | `create` `retrieve` `list` `del` — no `update` |

There is no `nixet.usage` or `nixet.billing`. `GET /v1/usage` exists in the API
and has no client method, so reading usage is a `fetch`.

Full signatures, parameters and return shapes: [references/api.md](references/api.md).

## Conventions that hold across resources

**Lists** return `{ data, count }`, where `count` is the total rather than the
page length. Paginate with `{ limit, offset }`.

**Errors** are typed by kind, so branch on the class rather than parsing a
message:

```ts
import { RateLimitError, NotFoundError } from "@nixet/sdk";
```

Connection failures, `429` and `5xx` are retried automatically with backoff. A
`4xx` is never retried, because repeating a bad request cannot help.

**Cancellation** is `{ signal }` on every method.

**Immutability** — configuration lives in versions that are never edited. When
something needs to change, publish a new version. A run records the version that
produced it, so a trace from last month still explains itself.

**Pinning** — an agent version pins the skill versions it was published with, and
a conversation pins its agent version for its whole life. Publishing never
changes something already running.

**Redaction** is a property of a version, not a call. A version with
`redaction: { mode: "standard" }` masks personal data before the run is
dispatched, so the runtime and the model provider receive `[GIVEN_NAME_1]`. It
covers run input and output; tool arguments and results in the trace are not
masked, and roughly one item in ten is missed. Never describe it as removing
personal data or as a compliance control.

**Tasks outlive their request.** A run finishes inside its HTTP request; a task
is queued, executed by a worker and polled for. A task delegates execution to a
run, so `task.run_id` is where its trace and cost live.

**Memory is refused alongside redaction.** The runtime would only ever see
placeholders, so it would retain a fact about `[GIVEN_NAME_1]` that is useless
immediately. Creating such a conversation fails with a `400`.

## When the SDK does not cover it

The SDK wraps the public API, which is documented at
[the SDK API reference](https://github.com/nixetio/nixet-sdk/blob/main/packages/sdk/api.md). If a capability exists in the API but
not in the SDK, say so plainly instead of writing a method that will not resolve.
