---
name: nixet-run-agent
description: Run a Nixet agent, with or without streaming. Use when the user wants to execute, invoke, test or stream an agent, or asks how to get output from one.
---

# Running a Nixet agent

Two shapes: wait for the result, or read it as it is produced. Both record the
same run, so a stream that drops can still be read afterwards.

## Waiting for the result

```ts
const run = await nixet.runs.create(agentId, { input: "What is 23 × 7?" });

run.status;    // "completed"
run.output;    // "23 times 7 is **161**."
run.usage;     // { input_tokens: 1092, output_tokens: 79 }
```

Use this for batch work, or anywhere nobody is watching a screen.

## Streaming

```ts
const stream = await nixet.runs.stream(agentId, { input: "Explain gravity" });

for await (const chunk of stream.chunks()) {
  process.stdout.write(chunk);
}
```

Four readers, one per run. Do not mix them on the same stream.

| | |
| --- | --- |
| `stream.chunks()` | Text deltas, for a terminal or socket |
| `for await (…of stream)` | Every event, including tool calls |
| `await stream.text()` | The finished output |
| `stream.on(type, fn)` | Handlers for specific events |

```ts
stream.on("run.tool.started", (event) => console.log("calling", event.data));
```

## Pinning a version

A run uses the agent's published version unless told otherwise:

```ts
await nixet.runs.create(agentId, { input: "…", version: "v2" });
```

Every run records the version and its digest, so a past result can always be
explained by the configuration that produced it.

## Conversations

Pass the same `sessionId` to group related runs:

```ts
await nixet.runs.create(agentId, { input: "…", sessionId: "conv_123" });
```

## Recovering a dropped stream

Events are recorded as they happen, so a lost connection is not a lost run:

```ts
const runId = await stream.runId;          // resolves before the run finishes
const missed = await nixet.runs.events(runId, { after: lastSequenceSeen });
```

Execution continues after a client disconnects, so `runs.retrieve(runId)` always
has an answer. Never re-run an agent just because a stream broke: it costs
tokens and may repeat a side effect.
