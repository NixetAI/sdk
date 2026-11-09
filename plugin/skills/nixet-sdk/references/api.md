# SDK reference

Generated shapes live in `@nixet/sdk`; this is the working summary. When the SDK
gains a resource, add a section here rather than editing the task skills.

## Client

```ts
new Nixet({
  apiKey?: string,      // or NIXET_API_KEY
  baseURL?: string,     // or NIXET_BASE_URL
  timeout?: number,     // default 600_000, a run waits on a model
  maxRetries?: number,  // default 2
  fetch?: typeof fetch,
})
```

Every method also accepts `{ signal }` for cancellation.

## whoami

```ts
await nixet.whoami(): Promise<Identity>
// { key_id, organization_id, project_id, environment_id, permissions }
```

## agents

```ts
await nixet.agents.create({
  name: string,
  description?: string,
  // Supplying instructions also publishes v1.
  instructions?: string,
  model?: ModelConfig,
  tools?: (string | { name: string })[],
  skills?: string[],
  mcpServers?: string[],
  toolPolicies?: Record<string, ToolPolicy>,
  knowledgeCollections?: string[],
  variables?: string[],
  guardrails?: CreateVersionParams["guardrails"], // see agents.versions
}): Promise<CreatedAgent>          // Agent & { version?: AgentVersion }

await nixet.agents.retrieve(agentId): Promise<Agent>
await nixet.agents.list({ limit?, offset? }): Promise<Page<Agent>>
```

`Agent` — `id`, `name`, `description`, `current_version`, `created_at`,
`updated_at`.

## agents.versions

```ts
await nixet.agents.versions.create(agentId, {
  instructions: string,
  model?: ModelConfig,
  tools?: (string | { name: string })[],
  skills?: string[],               // `name` or `name@v2`; pinned at publish
  mcpServers?: string[],
  toolPolicies?: Record<string, ToolPolicy>,
  knowledgeCollections?: string[], // by name; searched at run time
  variables?: string[],            // {{placeholders}} in instructions; must match exactly
  guardrails?: {                   // workspace guardrails, by name, per stage
    input?: string[],
    output?: string[],
    tool_result?: string[],
    mode?: "run_all" | "fail_fast",              // default run_all
    on_block?: "return_message" | "error",       // default return_message
  },
  redaction?: RedactionPolicyInput,
  publish?: boolean,               // default true
}): Promise<AgentVersion>

await nixet.agents.versions.retrieve(agentId, "v1"): Promise<AgentVersion>
await nixet.agents.versions.list(agentId, { limit?, offset? }): Promise<Page<AgentVersion>>
```

`AgentVersion` — `id`, `agent_id`, `version`, `instructions`, `model`, `tools`,
`skills`, `redaction`, `mcp_servers`, `tool_policies`, `knowledge_collections`,
`variables`, `guardrails`, `digest`, `created_at`.

## runs

```ts
await nixet.runs.create(agentId, {
  input: string,
  version?: string,                // defaults to the published version
  provider?: "nix" | "openai" | "anthropic",
  sessionId?: string,
  userId?: string,                 // whose memory and per-user connections apply
  variables?: Record<string, string>, // every declared variable, nothing else
  mcpServers?: string[],           // a subset of the version's servers
}): Promise<Run>

await nixet.runs.stream(agentId, params): Promise<RunStream>
await nixet.runs.retrieve(runId): Promise<Run>
await nixet.runs.list(agentId, { limit?, offset? }): Promise<Page<Run>>

await nixet.runs.events(runId, {
  after?: number,                  // resume past this sequence
  type?: RunEventType,
  limit?, offset?,
}): Promise<Page<RunEvent>>
```

`Run` — `id`, `agent_id`, `agent_version`, `variables`, `version_digest`,
`status`, `provider`, `input`, `output`, `error`, `usage`, `redaction`,
`latency_ms`, `cost_usd`, `trace_id`, `session_id`, `created_at`, `completed_at`.

## RunStream

```ts
stream.runId: Promise<string>      // resolves before the run finishes
stream.chunks(): AsyncGenerator<string>
stream.text(): Promise<string>
stream.on(type | "*", handler): () => void
for await (const event of stream) { … }
```

One reader per stream. A second read throws rather than returning nothing.

Common event types: `run.started`, `run.output`, `run.model.started`,
`run.model.completed`, `run.tool.started`, `run.tool.completed`,
`run.tool.failed`, `run.knowledge.started`, `run.knowledge.completed`,
`run.completed`, `run.failed`, `run.cancelled`. The full union is `RunEventType`
in the SDK's types.

## skills

```ts
nixet.skills.create({
  name: string,                     // lowercase, hyphenated
  description?: string,
  instructions?: string,            // publishes v1 when present
  tools?: (string | ToolRef)[],
}): Promise<Skill & { version?: SkillVersion }>

nixet.skills.retrieve(skillId): Promise<Skill>
nixet.skills.list({ limit?, offset? }): Promise<Page<Skill>>

nixet.skills.versions.create(skillId, {
  instructions: string,
  tools?: (string | ToolRef)[],
  publish?: boolean,                // default true
}): Promise<SkillVersion>

nixet.skills.versions.list(skillId, { limit?, offset? }): Promise<Page<SkillVersion>>
```

An agent uses a skill by naming it in a version: `skills: ["refund-policy"]`
pins whatever version is published at that moment, and `"refund-policy@v3"` pins
one explicitly. Publishing a new skill version never changes an agent already
running.

## conversations

```ts
nixet.conversations.create({
  agentId: string,
  userId?: string,
  title?: string,
  agentVersion?: string,            // pins the version for the thread's life
  memory?: { conversation?: boolean, user?: boolean, agent?: boolean },
}): Promise<Conversation>

nixet.conversations.retrieve(conversationId): Promise<Conversation>
nixet.conversations.list({ limit?, offset? }): Promise<Page<Conversation>>

nixet.conversations.send(conversationId, {
  input: string,
  provider?: Provider,
}): Promise<{ message: ConversationMessage, run_id: string, usage, cost_usd }>

nixet.conversations.messages(conversationId): Promise<Page<ConversationMessage>>
```

Memory is off unless asked for. It is **refused** when the pinned version
redacts: the agent would only ever see placeholders, so it would retain a fact
about `[GIVEN_NAME_1]`. That combination fails with a `400`.

A compacted turn stays in the transcript marked `superseded`, so history does
not get holes.

## users

```ts
nixet.users.create({
  reference: string,                // your own identifier for the person
  name?: string,
  email?: string,
  metadata?: Record<string, unknown>,
}): Promise<User>

nixet.users.retrieve(userId): Promise<User>
nixet.users.list({ limit?, offset? }): Promise<Page<User>>
```

A user is the customer's own customer, not a console member. Another workspace
using the same `reference` is a different person; the two never see each other.

## memory

```ts
nixet.memory.create({
  scope: "conversation" | "user" | "agent",
  agentId: string,
  userId?: string,                  // required when scope is "user"
  conversationId?: string,          // required when scope is "conversation"
  content: string,
  metadata?: Record<string, unknown>,
  expiresAt?: string,
}): Promise<MemoryRow[]>

nixet.memory.search({
  query: string,                    // describe the fact, do not quote it
  agentId: string,
  userId?: string,
  conversationId?: string,
  scope?: MemoryScope,
  limit?: number,
}): Promise<MemoryRow[]>

nixet.memory.list({ agentId, userId?, conversationId?, scope?, limit? }): Promise<MemoryRow[]>
nixet.memory.get(memoryId, { agentId, userId?, conversationId? }): Promise<MemoryRow>
nixet.memory.update(memoryId, { agentId, content?, metadata?, expiresAt? }): Promise<MemoryRow>
nixet.memory.delete(memoryId, { agentId, userId?, conversationId? }): Promise<void>
```

Recall is semantic: `"what do they prefer?"` finds `"I like metric units"`
without sharing a word with it.

A changed fact does not overwrite the old one. The replacement is returned with
`superseded: true` and `superseded_by` on the fact it replaced, so a caller can
show what changed rather than two contradictions. Only the current fact reaches
the model.

## tasks

```ts
nixet.tasks.create({
  agentId: string,
  input: string,
  version?: string,                 // pins a version; defaults to published
  conversationId?: string,
  userId?: string,
  maxAttempts?: number,             // default 3
}): Promise<Task>

nixet.tasks.retrieve(taskId): Promise<Task>
nixet.tasks.list({ status?, agentId?, limit?, offset? }): Promise<Page<Task>>
nixet.tasks.cancel(taskId): Promise<Task>
nixet.tasks.retry(taskId): Promise<Task>
nixet.tasks.resume(taskId): Promise<Task>

nixet.tasks.wait(taskId, {
  intervalMs?: number,              // default 2000
  timeoutMs?: number,               // default 600000
  onUpdate?: (task: Task) => void,
}): Promise<Task>
```

`create` returns a `queued` task, never a finished one. `wait` is the polling
loop, not a subscription: there is no push for tasks yet.

States: `queued`, `running`, `completed`, `failed`, `cancelled`. The type also
carries `waiting_for_tool`, `waiting_for_approval`, `waiting_for_user` and
`paused`, which **nothing produces yet** — they exist so adding tools and
approvals later is not a breaking change.

A failed task retries automatically with exponential backoff until
`max_attempts` is spent. `retry` resets the count.

## secrets

```ts
nixet.secrets.create({
  name: string,                     // lowercase, hyphenated; a version pins it
  value: string,
  description?: string,
}): Promise<Secret>

nixet.secrets.retrieve(secretId): Promise<Secret>
nixet.secrets.list({ name?, limit?, offset? }): Promise<Page<Secret>>
nixet.secrets.update(secretId, { value?, description? }): Promise<Secret>
nixet.secrets.del(secretId): Promise<Secret>
```

`Secret` is `{ id, name, description, hint, created_at, updated_at }`. No
response carries `value`, and no route exists that could answer with one.
`hint` is a few characters: enough to tell two apart, useless otherwise.

Rotating means writing a new value under the same name. Whatever refers to it
picks the new value up on its next run.

## mcpServers

```ts
nixet.mcpServers.create({
  name: string,                     // the handle a version pins; fixed
  url: string,
  transport?: "http" | "sse",       // default "http"; no stdio
  description?: string,
  auth?: McpAuth,                   // default { type: "none" }
}): Promise<McpServer>

nixet.mcpServers.retrieve(serverId): Promise<McpServer>
nixet.mcpServers.list({ name?, limit?, offset? }): Promise<Page<McpServer>>
nixet.mcpServers.update(serverId, { url?, transport?, description?, auth? })
nixet.mcpServers.del(serverId): Promise<McpServer>
```

`McpAuth` is one of `{ type: "none" }`, `{ type: "bearer", secret }`,
`{ type: "header", header, secret }`, `{ type: "oauth", secret }`. Every
authenticated variant **names a stored secret** rather than carrying a token.

`McpServer` carries `tool_count`, `tools_refreshed_at` and `last_error`. It has
no `tools` array — tools are their own resource — and no `allowed_tools` or
`blocked_tools`: those were replaced by per-tool policy, and sending them now
fails with `Unrecognized key`.

Discovery runs at registration, not during a run. An unreachable server still
registers, with `last_error` set and `tool_count` 0.

## tools

```ts
nixet.tools.retrieve(toolId): Promise<McpTool>
nixet.tools.list({ serverName?, name?, limit?, offset? }): Promise<Page<McpTool>>
```

Read-only: a tool exists because a server advertised it.

```ts
interface McpTool {
  id: string;
  server_id: string;
  server_name: string;              // how a policy addresses this tool
  name: string;
  description: string | null;
  tags: ("read" | "write" | "destructive" | "external")[];
  tag_source: "server" | "inferred";
  annotations: Record<string, unknown> | null;
  default_policy: "allow" | "ask" | "deny";
  discovered_at: string;
  updated_at: string;
}
```

`tags` and `default_policy` are a claim and a decision respectively, and they
are not the same kind of thing. Read the `nixet-mcp` skill before relying on
either.

## knowledge.collections

```ts
nixet.knowledge.collections.create({
  name: string,                     // lowercase, hyphenated; a version pins it
  description?: string,
  chunkStrategy?: "markdown" | "recursive",   // default "recursive"
  chunkSize?: number,               // 128–8000, default 1000
  chunkOverlap?: number,            // 0–2000, default 200, below chunkSize
}): Promise<KnowledgeCollection>

nixet.knowledge.collections.retrieve(collectionId): Promise<KnowledgeCollection>
nixet.knowledge.collections.list({ name?, limit?, offset? }): Promise<Page<KnowledgeCollection>>
nixet.knowledge.collections.del(collectionId): Promise<KnowledgeCollection>
```

`KnowledgeCollection` carries `chunk_strategy`, `chunk_size`, `chunk_overlap`,
`embedding_model`, `source_count` and `chunk_count`. `source_count` is every
document whatever its status; `chunk_count` covers only the sources that
reached `ready`.

No `update`. The chunk settings are what a collection is, so changing them
would make the chunks already stored disagree with the ones added next.
Re-chunking means another collection. `del` is refused while it still holds
sources, whose chunks would otherwise be orphaned in the vector store.

## knowledge.sources

```ts
nixet.knowledge.sources.create({
  collection: string,               // the collection's name, not its id
  kind: "text" | "url",             // `file` is multipart, not this route
  title: string,
  content: string,                  // the text itself, or the address
}): Promise<KnowledgeSource>

nixet.knowledge.sources.retrieve(sourceId): Promise<KnowledgeSource>
nixet.knowledge.sources.list({ collectionId?, status?, limit?, offset? }): Promise<Page<KnowledgeSource>>
nixet.knowledge.sources.del(sourceId): Promise<KnowledgeSource>
```

Status: `pending`, `converting`, `ocr`, `chunking`, `embedding`, `ready`,
`failed`. `create` answers `pending` — ingestion runs in a worker — so `status`
is the honest answer to "can my agent use this yet". Poll `retrieve`.

`KnowledgeSource` also carries `error`, `chunk_count`, `ocr_pages`,
`page_count`, `fetched_url` and `generation`. No `update`: a source is what was
ingested, so replacing a document means ingesting it again, which increments
`generation`.

To add a file, use `nixet.documents.convert({ file, collection })`, which
converts it and files it as a source in one call. **A scanned PDF fails**: no OCR engine is built, and the
error names the pages. Read the `nixet-knowledge` skill before relying on either.

## ToolPolicies

Declared on an agent version, as `server.tool` to policy:

```ts
await nixet.agents.versions.create(agent.id, {
  instructions: "…",
  mcpServers: ["github"],
  toolPolicies: { "github.delete_repo": "deny" },
});
```

Only the exceptions: anything unnamed takes the default its tags imply, so a
version does not need rewriting when a server adds a tool. Qualified by server
because two servers can both offer `search`.

`"ask"` is **refused at publish** — nothing can pause a run for a human yet.

## RedactionPolicy

Declared on an agent version, never on a call:

```ts
nixet.agents.versions.create(agentId, {
  instructions: "…",
  model: { provider: "nix", tier: "balanced" },
  redaction: {
    mode: "off" | "structured" | "standard" | "strict",
    reversible?: boolean,           // default false
    minimumConfidence?: number,     // 0..1, neural labels only
    labels?: RedactionLabel[],      // narrows the mode
    retainFor?: "1h" | "24h" | "7d" | "30d",
  },
})
```

| mode | masks |
| --- | --- |
| `off` | nothing |
| `structured` | only checksum-validated identifiers: cards, IBANs, SSNs, passports, tax IDs |
| `standard` | every personal category |
| `strict` | every category, including the company someone works for |

`structured` is the only mode whose detections all pass a real checksum, and it
leaves names alone, so the agent still works normally.

`reversible: true` keeps the placeholder map so the reply is restored on the way
out; the caller reads real values while the model never saw them. Off by
default: a run that keeps no map has nothing to leak.

A run reports what it masked as counts, never values:

```ts
run.redaction  // { mode, reversible, counts, item_count, expires_at } | null
```

Two things to state plainly whenever this comes up: the trace is **not** masked —
tool arguments and results are recorded as they were — and roughly one item in
ten is missed. It reduces personal data; it does not remove it, and it is not a
compliance control.

## ModelConfig

```ts
{ provider?: "nix", tier?: "fast" | "balanced" | "powerful" }
{ provider: "openai" | "anthropic", model: string }
```

Both accept `temperature` and `max_tokens`. `tier` exists only on `nix`;
`model` is required on the others, and the union enforces it at compile time.

## documents

```ts
await nixet.documents.convert({
  file: Blob | Uint8Array,         // up to 20 MB; format read from content
  filename?: string,               // needed for bytes; matters for CSV
  password?: string,               // opens a protected PDF; never stored
  collection?: string,             // also store as a knowledge source
  title?: string,                  // source title when storing
  signal?: AbortSignal,            // here, not as a second argument
}): Promise<DocumentConversionResult>
```

`DocumentConversionResult` — `markdown`, `bytes`, `page_count` (null for a
spreadsheet), `ocr_pages`, `source` (null unless `collection` was given,
otherwise `{ id, collection, status }`). Storing needs `knowledge:write`. A
password and a collection cannot be combined. See `nixet-documents`.

## guardrails

```ts
await nixet.guardrails.create({   // CreateGuardrailParams; wire field names
  name: string,                    // lowercase, numbers, hyphens; pinned by versions
  description?: string,
  stage: "input" | "output" | "tool_result",
  action: "allow" | "modify" | "warn" | "block",
  patterns?: { match: string, replace?: string }[], // case-insensitive regex, max 50
  detector?: "pii" | "topics" | "length",           // instead of patterns
  topics?: string[],               // for the topics detector
  max_characters?: number,         // for the length detector
  message?: string,                // shown when the guard blocks
}): Promise<Guardrail>

await nixet.guardrails.retrieve(id): Promise<Guardrail>
await nixet.guardrails.list({ name?, stage?, limit?, offset? }): Promise<Page<Guardrail>>
```

No `update` and no `delete` through the API. See `nixet-guardrails`.

## connections

```ts
await nixet.connections.create({
  userId: string,                  // usr_…
  server: string,                  // an MCP server with auth { type: "per_user" }
  value: string,                   // the credential; never returned
  expiresAt?: string,
  refreshValue?: string,
}): Promise<Connection>

await nixet.connections.retrieve(id): Promise<Connection>
await nixet.connections.list({ userId?, server?, status?, limit?, offset? }): Promise<Page<Connection>>
await nixet.connections.revoke(id): Promise<Connection>   // erases the credential, keeps the row
```

`Connection` — `id`, `user_id`, `server`, `scheme`, `status`
(`pending` · `active` · `expired` · `revoked`), `expires_at`, `last_used_at`,
`created_at`, `updated_at`. See `nixet-connections`.

## Not in the SDK

Endpoints that exist in the API with no client method. Call them with `fetch`,
and do not invent a resource for them:

| Endpoint | Why |
| --- | --- |
| `GET /v1/usage` | Reads the allowance. Billing is an account concern rather than an agent-building one, so it has no skill and no resource |
| `POST /v1/knowledge/sources/upload` | Multipart. Use `documents.convert({ file, collection })` instead, which converts and stores in one call |
| `POST /v1/billing/checkout`, `/portal` | Console-only. An API key is refused with a `403` |

## Errors

`BadRequestError` 400 · `AuthenticationError` 401 · `PermissionError` 403 ·
`NotFoundError` 404 · `ConflictError` 409 · `RateLimitError` 429 ·
`ServerError` 5xx · `ConnectionError` unreachable.

All extend `APIError` except `ConnectionError`; all extend `NixetError`.

There is **no subclass for 402.** A billing refusal arrives as a plain
`APIError` with `status === 402`, so branch on the status rather than on a
class that does not exist.
