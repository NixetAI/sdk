# Nixet TypeScript SDK

[![npm install @nixet/sdk](https://img.shields.io/npm/v/@nixet/sdk?style=for-the-badge&logo=npm&label=npm%20install%20%40nixet%2Fsdk&color=CB3837)](https://www.npmjs.com/package/@nixet/sdk)
[![Install in Claude Code](https://img.shields.io/badge/Install_in-Claude_Code-D97757?style=for-the-badge&logo=claude&logoColor=white)](#use-with-claude-code-and-codex)
[![Install in Codex](https://img.shields.io/badge/Install_in-Codex-000000?style=for-the-badge&logo=openai&logoColor=white)](#use-with-claude-code-and-codex)
[![MIT license](https://img.shields.io/npm/l/@nixet/sdk?style=for-the-badge)](./LICENSE)

The official TypeScript and JavaScript client for the [Nixet](https://nixet.ai) agent API.

Nixet runs agents for you. You create an agent, publish an immutable version of
its configuration, and run it — synchronously, as a stream, or as a background
task. This SDK covers the whole public API: agents and versions, runs and their
event logs, conversations, users, memory, skills, knowledge, MCP servers and
tools, per-user connections, guardrails, secrets, and document conversion.

The full method reference is in [api.md](./api.md). Release notes are in
[CHANGELOG.md](./CHANGELOG.md).

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Authentication and configuration](#authentication-and-configuration)
- [Agents and versions](#agents-and-versions)
- [Models](#models)
- [Built-in tools](#built-in-tools)
- [Runs](#runs)
- [Streaming](#streaming)
- [Variables](#variables)
- [Tasks](#tasks)
- [Users](#users)
- [Conversations](#conversations)
- [Memory](#memory)
- [Skills](#skills)
- [Knowledge](#knowledge)
- [Document conversion](#document-conversion)
- [MCP servers and tools](#mcp-servers-and-tools)
- [Per-user connections](#per-user-connections)
- [Guardrails](#guardrails)
- [Redaction](#redaction)
- [Secrets](#secrets)
- [Pagination](#pagination)
- [Errors](#errors)
- [Retries, timeouts and cancellation](#retries-timeouts-and-cancellation)
- [TypeScript](#typescript)
- [Use with Claude Code and Codex](#use-with-claude-code-and-codex)
- [Requirements](#requirements)

## Installation

```bash
npm install @nixet/sdk
# or
pnpm add @nixet/sdk
yarn add @nixet/sdk
bun add @nixet/sdk
```

The SDK has one dependency, [`@nixet/contracts`](https://www.npmjs.com/package/@nixet/contracts),
which carries the request and response types shared with the API.

## Quick start

```ts
import { Nixet } from "@nixet/sdk";

const nixet = new Nixet(); // reads NIXET_API_KEY

const agent = await nixet.agents.create({
  name: "Support Assistant",
  instructions: "You are concise. Use tools for arithmetic.",
  tools: ["calculate"],
});

const run = await nixet.runs.create(agent.id, { input: "What is 23 × 7?" });

console.log(run.output);   // "23 times 7 is **161**."
console.log(run.usage);    // token counts
console.log(run.cost_usd); // what the run cost
```

## Authentication and configuration

Create an API key in the [Nixet console](https://console.nixet.ai) under
**API keys**. A key is bound to one workspace and one environment
(`development` or `production`), so there is no workspace or project ID to pass.

```ts
import { Nixet } from "@nixet/sdk";

const nixet = new Nixet({
  apiKey: "nxt_…",                       // default: process.env.NIXET_API_KEY
  baseURL: "https://api.nixet.ai/v1",    // default: process.env.NIXET_BASE_URL, then this
  timeout: 600_000,                      // ms; default 10 minutes, since a run waits on a model
  maxRetries: 2,                         // default 2
  fetch: customFetch,                    // default: globalThis.fetch
});
```

| Option | Environment variable | Default |
| --- | --- | --- |
| `apiKey` | `NIXET_API_KEY` | required |
| `baseURL` | `NIXET_BASE_URL` | `https://api.nixet.ai/v1` |
| `timeout` | — | `600000` |
| `maxRetries` | — | `2` |
| `fetch` | — | `globalThis.fetch` |

Check what a key can do:

```ts
const me = await nixet.whoami();
// { key_id, organization_id, project_id, environment_id, permissions: [...] }
```

> Keep API keys on the server. Do not ship one in browser or mobile code.

## Agents and versions

An agent is an identity. Its behaviour — instructions, model, tools, skills,
knowledge, guardrails — lives in **versions**, which are numbered (`v1`, `v2`, …)
and never edited. A past run can always be explained by the version it recorded.

`agents.create` publishes the first version for you when you pass `instructions`:

```ts
const agent = await nixet.agents.create({
  name: "Research Assistant",
  description: "Answers questions with sources.",
  instructions: "Cite every claim.",
  model: { provider: "nix", tier: "powerful" },
  tools: ["web_search", "fetch_url"],
});

agent.current_version; // "v1"
agent.version;         // the AgentVersion that was published
```

Publish a new version later. New runs use it immediately; runs already in
flight keep the version they started with.

```ts
await nixet.agents.versions.create(agent.id, {
  instructions: "Cite every claim, and say when you are unsure.",
  tools: ["web_search", "fetch_url"],
});

// Stage a version without making it the default
await nixet.agents.versions.create(agent.id, { instructions: "…", publish: false });

const v1 = await nixet.agents.versions.retrieve(agent.id, "v1");
const versions = await nixet.agents.versions.list(agent.id);
```

Everything a version can carry:

| Field | Purpose |
| --- | --- |
| `instructions` | The system prompt. Required. |
| `model` | Provider and tier or model name. See [Models](#models). |
| `tools` | Built-in tool names. See [Built-in tools](#built-in-tools). |
| `skills` | Skills as `name` or `name@v2`. See [Skills](#skills). |
| `mcpServers` | Registered MCP servers this version may use. |
| `toolPolicies` | Per-tool `allow` / `deny`, as `server.tool`. |
| `knowledgeCollections` | Knowledge collections this version may search. |
| `variables` | `{{placeholders}}` a run must fill. See [Variables](#variables). |
| `guardrails` | Guardrails per stage. See [Guardrails](#guardrails). |
| `redaction` | Mask personal data. See [Redaction](#redaction). |
| `publish` | Make this the default version. Defaults to `true`. |

Configuration is checked when you publish, not when you run: an unknown tool, a
missing MCP server, or a placeholder used but not declared is refused at
publish with a `BadRequestError`.

## Models

The managed provider, `nix`, needs no key of your own. You choose a capability
tier rather than a model:

```ts
model: { provider: "nix", tier: "fast" }      // fast | balanced | powerful
```

To name a specific model, use its provider:

```ts
model: { provider: "openai", model: "gpt-4o-mini" }
model: { provider: "anthropic", model: "claude-sonnet-4-20250514" }
```

The types enforce the difference: `tier` exists only on `nix`, and `model` is
required on the others. Omitting `model` uses `nix` at the `balanced` tier.

A single run can override the provider:

```ts
await nixet.runs.create(agent.id, { input: "…", provider: "openai" });
```

## Built-in tools

| Tool | What it does |
| --- | --- |
| `current_time` | The current date and time |
| `calculate` | Arithmetic |
| `web_search` | Searches the web and returns results |
| `fetch_url` | Reads a web page as text. Private, loopback and cloud-metadata addresses are refused. Long pages are truncated. |

Tools are opt-in per version. Your own tools reach an agent through an
[MCP server](#mcp-servers-and-tools).

## Runs

`runs.create` runs an agent and waits for the result.

```ts
const run = await nixet.runs.create(agent.id, {
  input: "Summarise our refund policy.",
  version: "v2",          // pin a version; default is the published one
  provider: "anthropic",  // override the version's provider for this run
  sessionId: "sess_123",  // group related runs
  userId: user.id,        // who the agent is serving
  variables: { region: "EU" },
  mcpServers: ["broker"], // narrow to a subset of the version's servers
});

run.status;       // "completed" | "failed" | …
run.output;       // final text
run.error;        // set when status is "failed"
run.usage;        // token counts
run.cost_usd;     // total cost
run.latency_ms;   // wall-clock duration
run.variables;    // the values this run was given
```

Read runs back:

```ts
const same = await nixet.runs.retrieve(run.id);
const recent = await nixet.runs.list(agent.id, { limit: 20 });
```

Every run records an ordered event log — model calls, tool calls, knowledge
lookups, memory recall — which you can read at any time:

```ts
const events = await nixet.runs.events(run.id);
const toolCalls = await nixet.runs.events(run.id, { type: "run.tool.started" });
```

## Streaming

`runs.stream` returns a `RunStream` as soon as the run is accepted. Read it in
**one** of four ways:

```ts
const stream = await nixet.runs.stream(agent.id, { input: "Explain gravity" });

// 1. Text deltas, for a terminal or a socket
for await (const chunk of stream.chunks()) process.stdout.write(chunk);

// 2. Every event, including tool calls
for await (const event of stream) console.log(event.type, event.data);

// 3. The finished text
const text = await stream.text();

// 4. Handlers — subscribe, then consume with one of the above
stream.on("run.tool.started", (event) => console.log("calling", event.data));
stream.on("*", (event) => log(event));
```

`stream.runId` resolves as soon as the server accepts the run, before it
finishes:

```ts
const runId = await stream.runId;
```

Common events:

| Event | Meaning |
| --- | --- |
| `run.started` | Execution began |
| `run.output` | A text delta in `data` |
| `run.model.started` / `run.model.completed` | A model call |
| `run.tool.started` / `run.tool.completed` / `run.tool.failed` | A tool call |
| `run.knowledge.started` / `run.knowledge.completed` | A knowledge search |
| `run.memory.recall.started` / `run.memory.recall.completed` | Memory recall |
| `run.completed` / `run.failed` / `run.cancelled` | Terminal |

The full list is the `RunEventType` union in [api.md](./api.md#types).

### Recovering a dropped stream

Execution continues on the server if the client disconnects, and every event
carries a `sequence` number. Resume from the last one you saw instead of
running the agent again:

```ts
const missed = await nixet.runs.events(runId, { after: lastSequenceSeen });
const final = await nixet.runs.retrieve(runId);
```

## Variables

A version can declare `{{placeholders}}` in its instructions, and each run
fills them. The values a run received are recorded on it, so you can always see
exactly what prompt an agent was given.

```ts
await nixet.agents.versions.create(agent.id, {
  instructions: "You help {{customer_name}}. Their plan is {{plan}}.",
  variables: ["customer_name", "plan"],
});

await nixet.runs.create(agent.id, {
  input: "What can I do on my plan?",
  variables: { customer_name: "Sam", plan: "Pro" },
});
```

Placeholders must be declared: one used in the instructions but not listed in
`variables` (or listed but unused) is refused at publish. A run must supply
every declared variable and nothing else; an unknown key is refused rather than
ignored, so a run can never inject text into a slot the version did not name.

## Tasks

A run must finish inside its HTTP request. A **task** does not: it is queued,
executed by a worker, retried on failure, and polled for. Use it for long
research, reports, or batches.

```ts
const task = await nixet.tasks.create({
  agentId: agent.id,
  input: "Research this company and produce a report.",
  maxAttempts: 3, // default 3
});

const finished = await nixet.tasks.wait(task.id, {
  intervalMs: 2_000,   // default 2 s
  timeoutMs: 600_000,  // default 10 min
  onUpdate: (t) => console.log(t.status),
});

console.log(finished.output);
console.log(finished.run_id); // the run holding the trace, events and cost
```

```ts
await nixet.tasks.list({ status: "running", agentId: agent.id });
await nixet.tasks.cancel(task.id); // queued: stops now; running: stops when its run finishes
await nixet.tasks.retry(task.id);  // a failed or cancelled task, attempts reset
```

`tasks.wait` throws if the timeout passes; the task itself keeps going and can
be retrieved later.

## Users

A **user** is a person your agent serves — your customer, not a member of your
Nixet workspace. You identify them with your own `reference`. Memory and
per-user connections are isolated per user.

```ts
const user = await nixet.users.create({
  reference: "acme_user_8821", // your ID, unique in the workspace
  email: "sam@example.com",
  name: "Sam",
  metadata: { plan: "pro" },
});

const [found] = (await nixet.users.list({ reference: "acme_user_8821" })).data;
const same = await nixet.users.retrieve(user.id);
```

## Conversations

A conversation is a durable thread between an agent and a user. Each message is
a run, so cost, usage and traces work exactly as for single runs; the
conversation adds history.

```ts
const convo = await nixet.conversations.create({
  agentId: agent.id,
  userId: user.id,
  title: "Billing question",
  agentVersion: "v2",                 // pin, so a long thread cannot change behaviour
  memory: { user: true, conversation: true, agent: false }, // all off by default
});

await nixet.conversations.send(convo.id, { input: "Hi, I'm Sam." });
const reply = await nixet.conversations.send(convo.id, { input: "What's my name?" });

const transcript = await nixet.conversations.messages(convo.id); // oldest first
await nixet.conversations.list({ agentId: agent.id, userId: user.id });
```

## Memory

Memory is what an agent retains about a person, an agent, or a thread — a
preference, a constraint — as opposed to the literal transcript. Every call
names an agent, and optionally a user and a conversation, so one customer's
memory is never visible to another.

Scopes are `user`, `agent` and `conversation`.

```ts
await nixet.memory.create({
  scope: "user",
  agentId: agent.id,
  userId: user.id,
  content: "Prefers metric units and short answers.",
  expiresAt: "2027-01-01T00:00:00Z", // optional
});

const relevant = await nixet.memory.search({
  query: "what are their preferences?",
  agentId: agent.id,
  userId: user.id,
  limit: 10,
});

const everything = await nixet.memory.list({ agentId: agent.id, userId: user.id });

const target = { agentId: agent.id, userId: user.id };
await nixet.memory.get(memoryId, target);
await nixet.memory.update(memoryId, { ...target, content: "Prefers imperial units." });
await nixet.memory.delete(memoryId, target);
```

`memory.delete` is how you serve an erasure request for what an agent
remembers about a person.

## Skills

A skill is reusable expertise — instructions plus the tools they need —
versioned like an agent. Agent versions reference skills as `name` (latest
published) or `name@v2` (pinned).

```ts
await nixet.skills.create({
  name: "research/company-lookup",
  instructions: "State the industry and size of any company asked about.",
  tools: ["web_search"],
});

await nixet.skills.versions.create(skillId, { instructions: "…" });
await nixet.skills.versions.list(skillId);

await nixet.agents.versions.create(agent.id, {
  instructions: "You are a sales researcher.",
  skills: ["research/company-lookup@v1"],
});
```

## Knowledge

Knowledge lets an agent search your own documents. A **collection** is a named
index with a fixed chunking rule; **sources** are the documents in it.

```ts
const collection = await nixet.knowledge.collections.create({
  name: "support-policies",
  chunkStrategy: "markdown", // or "recursive" (default)
  chunkSize: 1000,           // 128–8000, default 1000
  chunkOverlap: 200,         // 0–2000, default 200
});

const source = await nixet.knowledge.sources.create({
  collection: "support-policies",
  kind: "url",               // or "text"
  title: "Refund policy",
  content: "https://example.com/refunds",
});

// Ingestion is asynchronous. Wait for "ready" (or "failed", with `error`).
let current = source;
while (current.status !== "ready" && current.status !== "failed") {
  await new Promise((r) => setTimeout(r, 2000));
  current = await nixet.knowledge.sources.retrieve(source.id);
}

await nixet.agents.versions.create(agent.id, {
  instructions: "Answer from the support policies.",
  knowledgeCollections: ["support-policies"],
});
```

A version names collections rather than embedding them, so documents added
later are found without republishing. Collections and sources are not editable:
to re-chunk, create a new collection; to change a document, delete the source
and add it again. A collection can only be deleted once it has no sources.

To upload a file into a collection, use
[`documents.convert`](#document-conversion) with `collection`.

## Document conversion

Converts a document to Markdown and returns it in the response. Formats include
PDF, Word (`doc`, `docx`), Excel (`xlsx`), PowerPoint (`ppt`, `pptx`),
OpenDocument (`odt`, `ods`, `odp`), RTF, EPUB and CSV, detected from the file's
content rather than its extension. Files up to 20 MB.

```ts
import { openAsBlob } from "node:fs";

const result = await nixet.documents.convert({
  file: await openAsBlob("statement.pdf"),
  password: "secret", // for protected PDFs; used once, never stored
});

result.markdown;
result.page_count;
result.ocr_pages; // pages read by OCR, if any
```

From bytes, pass a filename (it matters for CSV, which has no signature):

```ts
await nixet.documents.convert({ file: bytes, filename: "data.csv" });
```

Nothing is stored unless you name a collection, in which case the document is
also kept as a knowledge source:

```ts
const { source } = await nixet.documents.convert({
  file: blob,
  collection: "support-policies",
  title: "Refund policy 2026",
});
```

A password-protected document cannot be stored in a collection, because the
password is not kept and nothing could open it again.

> Scanned PDFs with no text layer are not supported yet.

## MCP servers and tools

Your own tools reach an agent through remote [MCP](https://modelcontextprotocol.io)
servers (`http` or `sse` transport). Registering a server discovers its tools.

```ts
await nixet.secrets.create({ name: "github-token", value: process.env.GH_PAT! });

const server = await nixet.mcpServers.create({
  name: "github",
  url: "https://mcp.example.com/mcp",
  auth: { type: "bearer", secret: "github-token" },
});

const tools = await nixet.tools.list({ serverName: "github" });

await nixet.agents.versions.create(agent.id, {
  instructions: "Use the GitHub tools to answer questions about the repo.",
  mcpServers: ["github"],
  toolPolicies: { "github.delete_repo": "deny" },
});
```

Authentication options — all except `none` and `per_user` name a stored
[secret](#secrets) rather than carrying the credential:

```ts
auth: { type: "none" }
auth: { type: "bearer", secret: "github-token" }
auth: { type: "header", header: "X-Api-Key", secret: "my-key" }
auth: { type: "oauth", secret: "my-access-token" }
auth: { type: "per_user", scheme: "api_key" } // see Per-user connections
```

Each tool carries `tags` (`read`, `write`, `destructive`, `external`) and a
`default_policy`. Tags come from the server's own annotations or from the tool
name, and they only decide the default. **What an agent may do is the policy on
the version**, which you control with `toolPolicies`. The `ask` policy is
reserved for approvals and is refused at publish for now.

Server URLs are checked at registration: private and loopback addresses are
refused. Changing a server's URL changes what published versions reach without
republishing them.

```ts
await nixet.mcpServers.update(server.id, { url: "https://new.example.com/mcp" });
await nixet.mcpServers.del(server.id);
```

## Per-user connections

When every end user links their own account on the same server — a broker, a
CRM — register the server once with `per_user` auth and store one credential
per user. A run uses the credential of the user it names.

```ts
await nixet.mcpServers.create({
  name: "broker",
  url: "https://mcp.broker.example.com/mcp",
  auth: { type: "per_user", scheme: "api_key" },
});

await nixet.connections.create({
  userId: user.id,
  server: "broker",
  value: userSuppliedKey,
  expiresAt: "2026-12-01T00:00:00Z", // optional
  refreshValue: refreshToken,        // optional
});

await nixet.runs.create(agent.id, { input: "What do I hold?", userId: user.id });
```

```ts
await nixet.connections.list({ userId: user.id, status: "active" });
await nixet.connections.revoke(connectionId); // erases the credential, keeps the record
```

Credentials are write-only and never returned. A run that needs a per-user
server whose connection is missing or expired **fails** rather than calling the
server unauthenticated. Statuses: `pending`, `active`, `expired`, `revoked`.

## Guardrails

Guardrails inspect and rewrite what an agent is given and what it says. They are
defined once per workspace and named by versions.

Three stages:

- `input` — before the model sees the text
- `output` — before the caller sees the response
- `tool_result` — on what a tool returned. Tool results can reach your
  application without passing through the agent's text, so an `output` guard
  never sees them.

Four actions: `allow`, `modify` (rewrite and continue), `warn` (pass through and
record), `block`.

```ts
// Pattern guard: find and replace
await nixet.guardrails.create({
  name: "account-scrub",
  stage: "output",
  action: "modify",
  patterns: [{ match: "\\b\\d{12}\\b", replace: "[ACCOUNT]" }],
});

// Built-in detector
await nixet.guardrails.create({
  name: "no-competitors",
  stage: "output",
  action: "block",
  detector: "topics",          // "pii" | "topics" | "length"
  topics: ["competitor pricing"],
  message: "I can't discuss that.",
});

await nixet.agents.versions.create(agent.id, {
  instructions: "…",
  guardrails: {
    input: ["no-competitors"],
    output: ["account-scrub"],
    tool_result: ["account-scrub"],
    mode: "run_all",            // or "fail_fast"
    on_block: "return_message", // or "error"
  },
});
```

Guards in one stage run in order, and under `run_all` each sees the text the
previous one produced, so several `modify` guards compose. Editing a guard's
rules applies on the next run everywhere it is named. When a version has output
guards, output events are buffered so a rewritten chunk is never sent first.

```ts
await nixet.guardrails.list({ stage: "output" });
await nixet.guardrails.retrieve(guardrailId);
```

## Redaction

A version can mask personal data in run input and output before it reaches the
model.

```ts
await nixet.agents.versions.create(agent.id, {
  instructions: "…",
  redaction: {
    mode: "standard",      // "off" | "structured" | "standard" | "strict"
    reversible: true,      // restore real values in the reply
    retainFor: "24h",      // how long the reversible map is kept
  },
});
```

Redaction reduces personal data; it does not guarantee removal, and traces are
not redacted. It cannot be combined with MCP servers, because tools would
receive placeholders instead of real values. `run.redaction` reports what was
masked, as counts.

## Secrets

Credentials you give Nixet so an agent can reach something of yours. Values are
write-only: no method returns one.

```ts
const secret = await nixet.secrets.create({
  name: "github-token",
  value: process.env.GH_PAT!,
  description: "Read-only PAT",
});

await nixet.secrets.update(secret.id, { value: newToken }); // rotate; picked up on the next run
await nixet.secrets.list({ name: "github-token" });          // metadata and a hint only
await nixet.secrets.del(secret.id);
```

Deleting a secret breaks anything that names it, including published versions.

## Pagination

List methods return a page:

```ts
const page = await nixet.agents.list({ limit: 50, offset: 0 });
page.data;  // this page
page.count; // total matching, across all pages
```

Fetch everything:

```ts
async function all<T>(fetchPage: (offset: number) => Promise<{ data: T[]; count: number }>) {
  const items: T[] = [];
  for (let offset = 0; ; ) {
    const page = await fetchPage(offset);
    items.push(...page.data);
    offset += page.data.length;
    if (page.data.length === 0 || offset >= page.count) return items;
  }
}

const agents = await all((offset) => nixet.agents.list({ limit: 100, offset }));
```

## Errors

Every failure is a subclass of `NixetError`. API errors carry `status` and
`requestId` — include the request ID when contacting support.

```ts
import {
  APIError,
  BadRequestError,
  NotFoundError,
  RateLimitError,
  ConnectionError,
} from "@nixet/sdk";

try {
  await nixet.runs.create(agentId, { input: "…" });
} catch (error) {
  if (error instanceof NotFoundError) {
    // no such agent in this workspace
  } else if (error instanceof BadRequestError) {
    console.error(error.message); // says what was wrong
  } else if (error instanceof RateLimitError) {
    // already retried; back off
  } else if (error instanceof APIError) {
    console.error(error.status, error.requestId);
  } else if (error instanceof ConnectionError) {
    // network failure, after retries
  }
}
```

| Class | Status |
| --- | --- |
| `BadRequestError` | 400 |
| `AuthenticationError` | 401 |
| `PermissionError` | 403 |
| `NotFoundError` | 404 |
| `ConflictError` | 409 |
| `RateLimitError` | 429 |
| `ServerError` | 5xx |
| `APIError` | any other status |
| `ConnectionError` | the API could not be reached |

Resources in another workspace answer 404, not 403, so their IDs are never
confirmed.

## Retries, timeouts and cancellation

Connection failures, `429` and `5xx` responses are retried automatically with
exponential backoff and jitter (up to 8 seconds between attempts), `maxRetries`
times. A `4xx` is never retried.

```ts
const nixet = new Nixet({ maxRetries: 0 }); // disable retries
```

Every method accepts an `AbortSignal`:

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 30_000);

await nixet.runs.create(agentId, { input: "…" }, { signal: controller.signal });
```

`documents.convert` takes `signal` inside its params instead.

## TypeScript

The SDK is written in TypeScript and ships declarations. Every request and
response type is exported:

```ts
import type {
  Agent, AgentVersion, Run, RunEvent, RunEventType,
  CreateAgentParams, CreateRunParams, CreateVersionParams,
  Task, User, Conversation, MemoryRow, KnowledgeSource, McpServer, McpTool,
} from "@nixet/sdk";
```

Responses use the API's `snake_case` field names (`run.cost_usd`); request
parameters use `camelCase` (`{ userId }`).

Both ESM and CommonJS are supported:

```ts
import { Nixet } from "@nixet/sdk";          // ESM
const { Nixet } = require("@nixet/sdk");     // CommonJS
```

## Use with Claude Code and Codex

The Nixet plugin teaches your coding agent this SDK, so it looks calls up
rather than guessing them. It adds skills for building an agent, running one,
debugging a run, and working with conversations, memory, tasks, MCP tools,
per-user connections, guardrails, variables, document conversion, secrets,
skills and knowledge.

**Claude Code**

```bash
claude plugin marketplace add nixetai/sdk
claude plugin install nixet@nixet
```

**Codex**

```bash
codex plugin marketplace add nixetai/sdk
codex plugin install nixet@nixet
```

Then set `NIXET_API_KEY` and ask, for example, *"Build me a Nixet agent that
answers support questions."*

## Requirements

- Node.js 18 or later, Deno, Bun, or any runtime with `fetch`
- TypeScript 5.5 or later, if you use TypeScript

## Support

- Source and issues: [github.com/nixetai/sdk](https://github.com/nixetai/sdk)
- Website: [nixet.ai](https://nixet.ai)
- Console: [console.nixet.ai](https://console.nixet.ai)
- Security issues: see [SECURITY.md](./SECURITY.md)

## License

[MIT](./LICENSE)
