---
name: nixet-tasks
description: Queue work that cannot finish inside an HTTP request, and follow it. Use when the user mentions long-running work, background jobs, research, batch processing, async agents, or asks what happens when a run would time out.
---

# Tasks

A run has to finish inside its request. Anything that cannot — research, a long
report, a batch of lookups — is a task: queued now, executed by a worker,
polled for.

```ts
const task = await nixet.tasks.create({
  agentId: agent.id,
  input: "Research this company and produce a report.",
});

task.status   // "queued" — never "completed" here
```

Returning immediately is the point. A task that came back finished would just
be a run.

## Following one

```ts
const finished = await nixet.tasks.wait(task.id, {
  onUpdate: (current) => console.log(current.status),
});
```

`wait` is the polling loop you would otherwise write. There is no push for
tasks yet, so say that rather than implying a subscription exists. It carries a
timeout, because a stuck task should fail the caller instead of hanging; the
task itself keeps going and can be retrieved later.

To poll by hand, use `nixet.tasks.retrieve(id)`.

## The run underneath

A task delegates execution to a run. `task.run_id` is where the trace, the
events and the cost live:

```ts
const events = await nixet.runs.events(finished.run_id);
```

Nothing is counted twice. When someone asks what a task cost, read its run.

## States

| state | means |
| --- | --- |
| `queued` | Waiting for a worker |
| `running` | A worker is executing it |
| `completed` | Finished; `output` is set |
| `failed` | Every attempt used; `error` says why |
| `cancelled` | Stopped before it finished |

Four more exist in the type — `waiting_for_tool`, `waiting_for_approval`,
`waiting_for_user`, `paused` — and **nothing produces them yet**. They are
declared so adding tools and approvals later is not a breaking change. Do not
write code that waits for them, and say so if asked.

## Attempts and retries

A failed task is retried automatically, backing off exponentially, until
`max_attempts` is spent. A failure is usually a rate limit or a provider blip,
so an immediate retry tends to fail the same way.

```ts
await nixet.tasks.create({ agentId, input, maxAttempts: 5 });   // default 3
```

`nixet.tasks.retry(id)` restarts a failed or cancelled task and resets the
count: asking for a retry means another go, not another go within a budget that
is already spent.

## Cancelling

```ts
await nixet.tasks.cancel(task.id);
```

A queued task stops at once. A running one is marked cancelled and the worker
notices when its run finishes — interrupting a model call mid-flight would
still be billed for, so the work is allowed to end.

## When to reach for a task

| | |
| --- | --- |
| Answer needed in the response | `runs.create` |
| Caller watches it arrive | `runs.stream` |
| Work outlives the request | `tasks.create` |
| Part of a thread | `conversations.send` |

A task is not faster. It is the same work, freed from the request's lifetime.

## What to check when one misbehaves

| Symptom | First thing to check |
| --- | --- |
| Stuck `queued` | Is a worker running? It polls inside the API process |
| `attempt` climbing | It is failing and retrying; read `error` |
| `run_after` set | Waiting out its backoff before the next attempt |
| No `run_id` | No worker has started it yet |
| `wait` threw a timeout | The task is still going; retrieve it later |

Do not report a task as done because it was queued. Read it back, and report
the status you actually saw.
