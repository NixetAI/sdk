# API reference

Every method on the `Nixet` client, the HTTP request it makes, and what it
returns. Paths are relative to the base URL, `https://api.nixet.ai/v1` by default.

Every method also accepts a final `options` argument, `{ signal?: AbortSignal }`,
omitted from the signatures below. List methods return `Page<T>`:
`{ data: T[]; count: number }`, where `count` is the total across all pages, and
accept `{ limit?, offset? }`.

- [Client](#client)
- [Agents](#agents)
- [Agent versions](#agent-versions)
- [Runs](#runs)
- [Tasks](#tasks)
- [Users](#users)
- [Conversations](#conversations)
- [Memory](#memory)
- [Skills](#skills)
- [Knowledge collections](#knowledge-collections)
- [Knowledge sources](#knowledge-sources)
- [Documents](#documents)
- [MCP servers](#mcp-servers)
- [Tools](#tools)
- [Connections](#connections)
- [Guardrails](#guardrails)
- [Secrets](#secrets)
- [RunStream](#runstream)
- [Errors](#errors)
- [Types](#types)

## Client

```ts
new Nixet(options?: NixetOptions)
```

| Option | Type | Default |
| --- | --- | --- |
| `apiKey` | `string` | `process.env.NIXET_API_KEY` (required) |
| `baseURL` | `string` | `process.env.NIXET_BASE_URL` or `https://api.nixet.ai/v1` |
| `timeout` | `number` (ms) | `600000` |
| `maxRetries` | `number` | `2` |
| `fetch` | `typeof fetch` | `globalThis.fetch` |

| Method | Request | Returns |
| --- | --- | --- |
| `nixet.whoami()` | `GET /whoami` | `Identity` |

## Agents

| Method | Request | Returns |
| --- | --- | --- |
| `nixet.agents.create(params)` | `POST /agents`, then `POST /agents/{id}/versions` when `instructions` is given | `CreatedAgent` |
| `nixet.agents.retrieve(agentId)` | `GET /agents/{id}` | `Agent` |
| `nixet.agents.list(params?)` | `GET /agents` | `Page<Agent>` |

**`CreateAgentParams`**

| Param | Type | Notes |
| --- | --- | --- |
| `name` | `string` | Required |
| `description` | `string` | |
| `instructions` | `string` | When given, publishes v1 with the fields below |
| `model` | `ModelConfig` | |
| `tools` | `(string \| ToolRef)[]` | |
| `skills` | `string[]` | `name` or `name@v2` |
| `mcpServers` | `string[]` | |
| `toolPolicies` | `Record<string, ToolPolicy>` | Keys are `server.tool` |
| `knowledgeCollections` | `string[]` | |
| `variables` | `string[]` | |
| `guardrails` | `CreateVersionParams["guardrails"]` | |

`CreatedAgent` is `Agent` plus `version?: AgentVersion`, present when a version
was published.

## Agent versions

| Method | Request | Returns |
| --- | --- | --- |
| `nixet.agents.versions.create(agentId, params)` | `POST /agents/{id}/versions` | `AgentVersion` |
| `nixet.agents.versions.retrieve(agentId, version)` | `GET /agents/{id}/versions/{version}` | `AgentVersion` |
| `nixet.agents.versions.list(agentId, params?)` | `GET /agents/{id}/versions` | `Page<AgentVersion>` |

**`CreateVersionParams`**

| Param | Type | Notes |
| --- | --- | --- |
| `instructions` | `string` | Required |
| `model` | `ModelConfig` | Default `{ provider: "nix", tier: "balanced" }` |
| `tools` | `(string \| ToolRef)[]` | `current_time`, `calculate`, `web_search`, `fetch_url` |
| `skills` | `string[]` | Pinned at publish |
| `redaction` | `RedactionPolicyInput` | Cannot be combined with `mcpServers` |
| `mcpServers` | `string[]` | Registered server names |
| `toolPolicies` | `Record<string, ToolPolicy>` | Only exceptions to the defaults; `ask` refused for now |
| `knowledgeCollections` | `string[]` | Collection names |
| `variables` | `string[]` | Must match the `{{placeholders}}` in `instructions` exactly |
| `guardrails` | `{ input?, output?, tool_result?: string[]; mode?: "run_all" \| "fail_fast"; on_block?: "return_message" \| "error" }` | Defaults `run_all`, `return_message` |
| `publish` | `boolean` | Default `true` |

## Runs

| Method | Request | Returns |
| --- | --- | --- |
| `nixet.runs.create(agentId, params)` | `POST /agents/{id}/runs` | `Run` |
| `nixet.runs.stream(agentId, params)` | `POST /agents/{id}/runs/stream` (server-sent events) | `RunStream` |
| `nixet.runs.retrieve(runId)` | `GET /runs/{id}` | `Run` |
| `nixet.runs.list(agentId, params?)` | `GET /agents/{id}/runs` | `Page<Run>` |
| `nixet.runs.events(runId, params?)` | `GET /runs/{id}/events` | `Page<RunEvent>` |

**`CreateRunParams`**

| Param | Type | Notes |
| --- | --- | --- |
| `input` | `string` | Required |
| `version` | `string` | e.g. `"v2"`. Default: the published version |
| `provider` | `Provider` | Overrides the version's provider for this run |
| `sessionId` | `string` | Groups related runs |
| `userId` | `string` | Decides whose memory and connections apply |
| `variables` | `Record<string, string>` | Every declared variable, nothing else |
| `mcpServers` | `string[]` | Subset of the version's servers |

**`ListEventsParams`** — `limit`, `offset`, plus:

| Param | Type | Notes |
| --- | --- | --- |
| `after` | `number` | Only events with a higher `sequence` |
| `type` | `RunEventType` | Only this event type |

## Tasks

| Method | Request | Returns |
| --- | --- | --- |
| `nixet.tasks.create(params)` | `POST /tasks` | `Task` |
| `nixet.tasks.retrieve(taskId)` | `GET /tasks/{id}` | `Task` |
| `nixet.tasks.list(params?)` | `GET /tasks` | `Page<Task>` |
| `nixet.tasks.cancel(taskId)` | `POST /tasks/{id}/cancel` | `Task` |
| `nixet.tasks.retry(taskId)` | `POST /tasks/{id}/retry` | `Task` |
| `nixet.tasks.resume(taskId)` | `POST /tasks/{id}/resume` | `Task` |
| `nixet.tasks.wait(taskId, options?)` | Polls `GET /tasks/{id}` | `Task` |

**`CreateTaskParams`**: `agentId` (required), `input` (required), `version`,
`conversationId`, `userId`, `provider`, `memory: MemoryPolicy`,
`maxAttempts` (default 3).

**`ListTaskParams`**: `limit`, `offset`, `status: TaskStatus`, `agentId`,
`conversationId`.

**`wait` options**: `intervalMs` (default 2000), `timeoutMs` (default 600000),
`onUpdate(task)`, `signal`. Resolves when the status is `completed`, `failed`
or `cancelled`; throws on timeout without cancelling the task.

`resume` exists for paused tasks; nothing pauses a task yet.

## Users

| Method | Request | Returns |
| --- | --- | --- |
| `nixet.users.create(params)` | `POST /users` | `User` |
| `nixet.users.retrieve(userId)` | `GET /users/{id}` | `User` |
| `nixet.users.list(params?)` | `GET /users` | `Page<User>` |

**`CreateUserParams`**: `reference` (required, unique in the workspace),
`email`, `name`, `metadata: Record<string, unknown>`.

`list` accepts `reference` to find a user by your own ID.

## Conversations

| Method | Request | Returns |
| --- | --- | --- |
| `nixet.conversations.create(params)` | `POST /conversations` | `Conversation` |
| `nixet.conversations.retrieve(conversationId)` | `GET /conversations/{id}` | `Conversation` |
| `nixet.conversations.list(params?)` | `GET /conversations` | `Page<Conversation>` |
| `nixet.conversations.send(conversationId, params)` | `POST /conversations/{id}/messages` | `SendMessageResponse` |
| `nixet.conversations.messages(conversationId)` | `GET /conversations/{id}/messages` | `Page<ConversationMessage>` |

**`CreateConversationParams`**: `agentId` (required), `userId`, `title`,
`agentVersion`, `memory: Partial<MemoryPolicy>`.

**`SendMessageParams`**: `input` (required), `provider`.

`list` accepts `agentId` and `userId`.

## Memory

Every call names a target: `agentId` (required), and optionally `userId` and
`conversationId`.

| Method | Request | Returns |
| --- | --- | --- |
| `nixet.memory.create(params)` | `POST /memory` | `MemoryRow[]` |
| `nixet.memory.search(params)` | `POST /memory/search` | `MemoryRow[]` |
| `nixet.memory.list(params)` | `POST /memory/list` | `MemoryRow[]` |
| `nixet.memory.get(memoryId, target)` | `GET /memory/{id}` | `MemoryRow` |
| `nixet.memory.update(memoryId, params)` | `PATCH /memory/{id}` | `MemoryRow` |
| `nixet.memory.delete(memoryId, target)` | `DELETE /memory/{id}` | `void` |

| Params | Fields |
| --- | --- |
| `CreateMemoryParams` | target + `scope: MemoryScope` (required), `content` (required), `metadata`, `expiresAt` |
| `SearchMemoryParams` | target + `query` (required), `scope`, `limit` (default 10) |
| `ListMemoryParams` | target + `scope`, `limit` (default 50) |
| `UpdateMemoryParams` | target + `content`, `metadata`, `expiresAt` (`null` clears) |

## Skills

| Method | Request | Returns |
| --- | --- | --- |
| `nixet.skills.create(params)` | `POST /skills`, then `POST /skills/{id}/versions` when `instructions` is given | `Skill & { version?: SkillVersion }` |
| `nixet.skills.retrieve(skillId)` | `GET /skills/{id}` | `Skill` |
| `nixet.skills.list(params?)` | `GET /skills` | `Page<Skill>` |
| `nixet.skills.versions.create(skillId, params)` | `POST /skills/{id}/versions` | `SkillVersion` |
| `nixet.skills.versions.list(skillId, params?)` | `GET /skills/{id}/versions` | `Page<SkillVersion>` |

**`CreateSkillParams`**: `name` (required; lowercase, optionally `group/name`),
`description`, `instructions`, `tools`.

**`CreateSkillVersionParams`**: `instructions` (required), `tools`, `publish`
(default `true`).

## Knowledge collections

| Method | Request | Returns |
| --- | --- | --- |
| `nixet.knowledge.collections.create(params)` | `POST /knowledge/collections` | `KnowledgeCollection` |
| `nixet.knowledge.collections.retrieve(collectionId)` | `GET /knowledge/collections/{id}` | `KnowledgeCollection` |
| `nixet.knowledge.collections.list(params?)` | `GET /knowledge/collections` | `Page<KnowledgeCollection>` |
| `nixet.knowledge.collections.del(collectionId)` | `DELETE /knowledge/collections/{id}` | `KnowledgeCollection` |

**`CreateKnowledgeCollectionParams`**: `name` (required; lowercase and
hyphenated), `description`, `chunkStrategy: "recursive" | "markdown"` (default
`recursive`), `chunkSize` (128–8000, default 1000), `chunkOverlap` (0–2000,
default 200, below `chunkSize`). Chunk settings are fixed at creation.

`list` accepts `name`. `del` is refused while the collection has sources.

## Knowledge sources

| Method | Request | Returns |
| --- | --- | --- |
| `nixet.knowledge.sources.create(params)` | `POST /knowledge/sources` | `KnowledgeSource` |
| `nixet.knowledge.sources.retrieve(sourceId)` | `GET /knowledge/sources/{id}` | `KnowledgeSource` |
| `nixet.knowledge.sources.list(params?)` | `GET /knowledge/sources` | `Page<KnowledgeSource>` |
| `nixet.knowledge.sources.del(sourceId)` | `DELETE /knowledge/sources/{id}` | `KnowledgeSource` |

**`CreateKnowledgeSourceParams`**: `collection` (required; the name),
`kind: "text" | "url"` (required), `title` (required), `content` (required; the
text, or the URL).

`create` returns while the source is still `pending`; poll `retrieve` until
`status` is `ready` or `failed`. `list` accepts `collectionId` and `status`.
To add a file, use `documents.convert` with `collection`.

## Documents

| Method | Request | Returns |
| --- | --- | --- |
| `nixet.documents.convert(params)` | `POST /documents/convert` (multipart) | `DocumentConversionResult` |

**`ConvertDocumentParams`**

| Param | Type | Notes |
| --- | --- | --- |
| `file` | `Blob \| Uint8Array` | Required. Up to 20 MB |
| `filename` | `string` | Needed for bytes; matters for CSV |
| `password` | `string` | Opens a protected PDF; never stored |
| `collection` | `string` | Also store as a knowledge source. Needs `knowledge:write` |
| `title` | `string` | Source title when storing |
| `signal` | `AbortSignal` | Passed here rather than as a second argument |

**`DocumentConversionResult`**: `markdown`, `bytes`, `page_count` (null for
spreadsheets), `ocr_pages: number[]`, `source` (null unless a collection was
named; otherwise `{ id, collection, status }`).

## MCP servers

| Method | Request | Returns |
| --- | --- | --- |
| `nixet.mcpServers.create(params)` | `POST /mcp/servers` | `McpServer` |
| `nixet.mcpServers.retrieve(serverId)` | `GET /mcp/servers/{id}` | `McpServer` |
| `nixet.mcpServers.list(params?)` | `GET /mcp/servers` | `Page<McpServer>` |
| `nixet.mcpServers.update(serverId, params)` | `PATCH /mcp/servers/{id}` | `McpServer` |
| `nixet.mcpServers.del(serverId)` | `DELETE /mcp/servers/{id}` | `McpServer` |

**`CreateMcpServerParams`**: `name` (required, fixed once created), `url`
(required; public `http(s)` only), `transport: "http" | "sse"` (default
`http`), `description`, `auth: McpAuth` (default `{ type: "none" }`).

**`UpdateMcpServerParams`**: `url`, `transport`, `description`, `auth`.
Changing `url` rediscovers the tools.

`list` accepts `name`.

## Tools

Read-only: tools are discovered from registered MCP servers.

| Method | Request | Returns |
| --- | --- | --- |
| `nixet.tools.list(params?)` | `GET /mcp/tools` | `Page<McpTool>` |
| `nixet.tools.retrieve(toolId)` | `GET /mcp/tools/{id}` | `McpTool` |

`list` accepts `serverName` and `name`.

## Connections

| Method | Request | Returns |
| --- | --- | --- |
| `nixet.connections.create(params)` | `POST /mcp/connections` | `Connection` |
| `nixet.connections.retrieve(id)` | `GET /mcp/connections/{id}` | `Connection` |
| `nixet.connections.list(params?)` | `GET /mcp/connections` | `Page<Connection>` |
| `nixet.connections.revoke(id)` | `DELETE /mcp/connections/{id}` | `Connection` |

**`CreateConnectionParams`**: `userId` (required), `server` (required; a server
with `per_user` auth), `value` (required; never returned), `expiresAt`,
`refreshValue`.

**`ListConnectionParams`**: `limit`, `offset`, `userId`, `server`,
`status: ConnectionStatus`.

**`Connection`**: `id`, `user_id`, `server`, `scheme`, `status`, `expires_at`,
`last_used_at`, `created_at`, `updated_at`.

## Guardrails

| Method | Request | Returns |
| --- | --- | --- |
| `nixet.guardrails.create(params)` | `POST /guardrails` | `Guardrail` |
| `nixet.guardrails.retrieve(id)` | `GET /guardrails/{id}` | `Guardrail` |
| `nixet.guardrails.list(params?)` | `GET /guardrails` | `Page<Guardrail>` |

**`CreateGuardrailParams`** (wire field names)

| Param | Type | Notes |
| --- | --- | --- |
| `name` | `string` | Required; lowercase, numbers, hyphens |
| `description` | `string` | |
| `stage` | `"input" \| "output" \| "tool_result"` | Required |
| `action` | `"allow" \| "modify" \| "warn" \| "block"` | Required. `modify` needs `replace` on every pattern |
| `patterns` | `{ match: string; replace?: string }[]` | Case-insensitive regular expressions, up to 50 |
| `detector` | `"pii" \| "topics" \| "length"` | Instead of `patterns` |
| `topics` | `string[]` | For the `topics` detector |
| `max_characters` | `number` | For the `length` detector |
| `message` | `string` | Shown when the guard blocks |

`list` accepts `name` and `stage`. Guardrails have no update or delete through
the API.

## Secrets

| Method | Request | Returns |
| --- | --- | --- |
| `nixet.secrets.create(params)` | `POST /secrets` | `Secret` |
| `nixet.secrets.retrieve(secretId)` | `GET /secrets/{id}` | `Secret` |
| `nixet.secrets.list(params?)` | `GET /secrets` | `Page<Secret>` |
| `nixet.secrets.update(secretId, params)` | `PATCH /secrets/{id}` | `Secret` |
| `nixet.secrets.del(secretId)` | `DELETE /secrets/{id}` | `Secret` |

**`CreateSecretParams`**: `name` (required; lowercase and hyphenated, fixed),
`value` (required; never returned), `description`.

**`UpdateSecretParams`**: `value`, `description`.

`list` accepts `name`. `Secret` holds metadata and a hint, never the value.

## RunStream

Returned by `nixet.runs.stream`. Read it one way per run.

| Member | Type | Notes |
| --- | --- | --- |
| `runId` | `Promise<string>` | Resolves when the server accepts the run |
| `[Symbol.asyncIterator]()` | `AsyncGenerator<RunEvent>` | Every event |
| `chunks()` | `AsyncGenerator<string>` | Only `run.output` text |
| `text()` | `Promise<string>` | The full output once finished |
| `on(type \| "*", handler)` | `() => void` | Subscribe; returns an unsubscribe function |

Reading a stream twice throws.

## Errors

```text
NixetError
├── APIError              status, requestId
│   ├── BadRequestError       400
│   ├── AuthenticationError   401
│   ├── PermissionError       403
│   ├── NotFoundError         404
│   ├── ConflictError         409
│   ├── RateLimitError        429
│   └── ServerError           5xx
└── ConnectionError       cause
```

`ConnectionError`, `RateLimitError` and `ServerError` are retried automatically
up to `maxRetries` times before being thrown.

## Types

All types are exported from `@nixet/sdk`. Response objects use the API's
`snake_case` field names.

```ts
type Provider = "nix" | "openai" | "anthropic";
type Tier = "fast" | "balanced" | "powerful";

type ModelConfig =
  | { provider: "nix"; tier?: Tier }
  | { provider: "openai" | "anthropic"; model: string };

type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

type TaskStatus =
  | "queued" | "running" | "completed" | "failed" | "cancelled"
  // declared for future approvals and pauses; not produced yet
  | "waiting_for_tool" | "waiting_for_approval" | "waiting_for_user" | "paused";

type MemoryScope = "conversation" | "user" | "agent";
interface MemoryPolicy { conversation: boolean; user: boolean; agent: boolean }

type ToolTag = "read" | "write" | "destructive" | "external";
type ToolPolicy = "allow" | "ask" | "deny";

type McpTransport = "http" | "sse";
type McpConnectionScheme = "api_key" | "oauth2" | "session";
type McpAuth =
  | { type: "none" }
  | { type: "bearer"; secret: string }
  | { type: "header"; header: string; secret: string }
  | { type: "oauth"; secret: string }
  | { type: "per_user"; scheme: McpConnectionScheme };

type ConnectionStatus = "pending" | "active" | "expired" | "revoked";

type SourceKind = "file" | "text" | "url";
type ChunkStrategy = "markdown" | "recursive";

type RedactionMode = "off" | "structured" | "standard" | "strict";
interface RedactionPolicyInput {
  mode: RedactionMode;
  reversible?: boolean;
  minimumConfidence?: number;
  labels?: RedactionLabel[];
  retainFor?: "1h" | "24h" | "7d" | "30d";
}

interface Identity {
  key_id: string | null;
  organization_id: string;
  project_id: string;
  environment_id: "development" | "production";
  permissions: string[];
}
```

### Run events

```ts
type RunEventType =
  | "run.started" | "run.completed" | "run.failed" | "run.cancelled"
  | "run.paused" | "run.continued"
  | "run.output"
  | "run.model.started" | "run.model.completed"
  | "run.tool.started" | "run.tool.completed" | "run.tool.failed"
  | "run.knowledge.started" | "run.knowledge.completed"
  | "run.memory.recall.started" | "run.memory.recall.completed"
  | "run.memory.update.started" | "run.memory.update.completed"
  | "run.reasoning.started" | "run.reasoning.completed"
  | "run.subagent.spawned" | "run.subagent.completed"
  | "run.subagent.failed" | "run.subagent.killed"
  | "run.workflow.step.started" | "run.workflow.step.completed"
  | "run.workflow.step.failed" | "run.workflow.step.skipped"
  | "run.task.created" | "run.task.status"
  | "run.session.summarised" | "run.context.compressed"
  | "run.skill.loaded";
```

Each `RunEvent` carries a `sequence` (monotonic within a run), a `type`, a
`category`, optional `data`, and timestamps. Resume a dropped stream with
`runs.events(runId, { after: sequence })`.

For the exact fields of every response object, see the type declarations
shipped in the package (`dist/cjs/types.d.ts`) or the
[`@nixet/contracts`](https://www.npmjs.com/package/@nixet/contracts) schemas.
