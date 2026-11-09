/** Public types, mirroring the wire contract in camelCase-free form. */

export type Provider = "nix" | "openai" | "anthropic";
export type Tier = "fast" | "balanced" | "powerful";
export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type RunEventType =
  | "run.started"
  | "run.completed"
  | "run.failed"
  | "run.cancelled"
  | "run.paused"
  | "run.continued"
  | "run.output"
  | "run.model.started"
  | "run.model.completed"
  | "run.tool.started"
  | "run.tool.completed"
  | "run.tool.failed"
  | "run.knowledge.started"
  | "run.knowledge.completed"
  | "run.memory.recall.started"
  | "run.memory.recall.completed"
  | "run.memory.update.started"
  | "run.memory.update.completed"
  | "run.reasoning.started"
  | "run.reasoning.completed"
  | "run.subagent.spawned"
  | "run.subagent.completed"
  | "run.subagent.failed"
  | "run.subagent.killed"
  | "run.workflow.step.started"
  | "run.workflow.step.completed"
  | "run.workflow.step.failed"
  | "run.workflow.step.skipped"
  | "run.task.created"
  | "run.task.status"
  | "run.session.summarised"
  | "run.context.compressed"
  /** A skill was loaded into the agent, before the first model call. */
  | "run.skill.loaded";

/**
 * What an event describes.
 *
 * Coarser than the type, so a timeline can be grouped or filtered without
 * knowing every individual event.
 */
export type EventCategory =
  | "run"
  | "model"
  | "tool"
  | "output"
  | "memory"
  | "knowledge"
  | "reasoning"
  | "approval"
  | "subagent"
  | "workflow"
  | "task"
  | "session"
  | "context"
  | "skill";

/** Token counts for one span, where the provider reports them. */
export interface EventTokens {
  input?: number;
  output?: number;
  cache_read?: number;
  reasoning?: number;
}

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  /** Version used when a run does not name one. Null until the first publish. */
  current_version: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Model selection.
 *
 * `nix` is managed and picks a model from `tier`. The other providers need an
 * explicit `model`, because the caller is paying for it.
 */
export type ModelConfig =
  | { provider?: "nix"; tier?: Tier; temperature?: number; max_tokens?: number }
  | {
      provider: "openai" | "anthropic";
      model: string;
      temperature?: number;
      max_tokens?: number;
    };

export interface ToolRef {
  name: string;
}

export interface AgentVersion {
  id: string;
  agent_id: string;
  version: string;
  instructions: string;
  model: ModelConfig;
  tools: ToolRef[];
  /**
   * Skills this version uses, each already pinned to one version. A bare name
   * resolving at run time would make a past run unreproducible.
   */
  skills: ResolvedSkill[];
  /** Masking applied to run input and output. Part of the digest. */
  redaction: RedactionPolicy;
  /** MCP servers this version may use, pinned by name at publish. */
  mcp_servers: string[];
  /** Per-tool overrides as `server.tool`. Only the exceptions are stored. */
  tool_policies: Record<string, ToolPolicy>;
  /** Knowledge collections this version may search, pinned by name. */
  knowledge_collections: string[];
  /**
   * Placeholders in `instructions` that a run must supply.
   *
   * Read this to know what a run needs: every name here is required on
   * `variables`, and nothing outside it is accepted.
   */
  variables: string[];
  /** Guardrails this version runs, pinned by name at publish. */
  guardrails: GuardrailBinding;
  /** Content hash of the frozen configuration; recorded on every run. */
  digest: string;
  created_at: string;
}

/**
 * Which guardrails a version runs, and what a block does.
 *
 * Order is the order given: under `run_all` each guard sees the text the
 * previous one produced.
 */
export interface GuardrailBinding {
  input: string[];
  output: string[];
  tool_result: string[];
  mode: "run_all" | "fail_fast";
  on_block: "return_message" | "error";
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

/**
 * How much of a run's input and output is masked before dispatch.
 *
 * Only `structured` is entirely checksum-validated. `standard` covers every
 * category that identifies a person; `strict` adds the company they work for.
 */
/**
 * What a version returns, which is the wire shape.
 *
 * Distinct from `RedactionPolicyInput` because the API speaks snake_case and
 * the SDK does not translate a response. Claiming otherwise would hand back an
 * object whose fields are all undefined.
 */
export interface RedactionPolicy {
  mode: RedactionMode;
  reversible: boolean;
  minimum_confidence: number;
  labels?: RedactionLabel[];
  retain_for: "1h" | "24h" | "7d" | "30d";
}

/** What a caller passes when publishing a version. */
export interface RedactionPolicyInput {
  mode: RedactionMode;
  /** Keep the map so the reply can be restored. Off by default. */
  reversible?: boolean;
  /** Confidence floor for model-inferred labels. Structured labels ignore it. */
  minimumConfidence?: number;
  /** Narrows the mode to these categories. Rarely needed. */
  labels?: RedactionLabel[];
  /** How long a reversible map is kept. */
  retainFor?: "1h" | "24h" | "7d" | "30d";
}

/** Detection categories the redactor reports. */
export type RedactionLabel =
  | "GIVEN_NAME" | "SURNAME" | "STREET_NAME" | "BUILDING_NUMBER" | "SECONDARY_ADDRESS"
  | "CITY" | "STATE" | "ZIP_CODE" | "EMAIL" | "PHONE" | "CREDIT_CARD" | "BANK_ACCOUNT"
  | "ROUTING_NUMBER" | "IP_ADDRESS" | "URL" | "GOVERNMENT_ID" | "PASSPORT"
  | "DRIVERS_LICENSE" | "TAX_ID" | "SSN" | "IMEI" | "ORG";

export type RedactionMode = "off" | "structured" | "standard" | "strict";

/**
 * What a run masked.
 *
 * Counts only. The masked values are the personal data the run removed, so they
 * are never returned.
 */
export interface RedactionSummary {
  mode: RedactionMode;
  reversible: boolean;
  counts: Partial<Record<RedactionLabel, number>>;
  item_count: number;
  /** When the stored map is destroyed. Null when the run kept none. */
  expires_at: string | null;
}

export interface Run {
  id: string;
  agent_id: string;
  agent_version: string;
  /** Placeholder values this run was given. Null when the version declared none. */
  variables: Record<string, string> | null;
  version_digest: string;
  status: RunStatus;
  provider: Provider;
  /** Masked when the version redacts: what was stored, not what was sent. */
  input: string;
  output: string | null;
  error: string | null;
  usage: Usage | null;
  /** What was masked, as counts. Null when the version does not redact. */
  redaction: RedactionSummary | null;
  /** Wall-clock duration of the run. */
  latency_ms: number | null;
  /** Total USD, summed from the run's model calls. */
  cost_usd: number | null;
  trace_id: string | null;
  session_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface RunEvent {
  /** Monotonic within a run, so a dropped stream can resume. */
  sequence: number;
  type: RunEventType;
  category: EventCategory;
  run_id: string;
  /** Short label: a text delta, a tool name, or a failure reason. */
  data: string | null;
  /**
   * Fields specific to this event type. Shapes differ by category: a tool event
   * carries arguments and a result, a knowledge event carries documents found.
   */
  payload: Record<string, unknown> | null;
  duration_ms: number | null;
  tokens: EventTokens | null;
  /** Computed from tokens; null when the model has no published rate. */
  cost_usd: number | null;
  /**
   * The event that produced this one, so a trace reads as a tree. A sub-agent's
   * events point at the event that spawned it.
   */
  parent_event_id: string | null;
  created_at: string;
}

export interface Identity {
  key_id: string | null;
  organization_id: string;
  project_id: string;
  environment_id: "development" | "production";
  permissions: string[];
}

/** A list response. `count` is the total, not the page length. */
export interface Page<T> {
  data: T[];
  count: number;
}

export interface ListParams {
  limit?: number;
  offset?: number;
}

export interface Skill {
  id: string;
  name: string;
  description: string | null;
  current_version: string | null;
  created_at: string;
  updated_at: string;
}

export interface SkillVersion {
  id: string;
  skill_id: string;
  version: string;
  instructions: string;
  tools: ToolRef[];
  digest: string;
  created_at: string;
}

/** A skill as pinned on an agent version. */
export interface ResolvedSkill {
  name: string;
  version: string;
  digest: string;
}

/** A person your agent serves. Not a Nixet console member. */
export interface User {
  id: string;
  reference: string;
  email: string | null;
  name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** What an agent may remember. Everything is off unless asked for. */
export interface MemoryPolicy {
  conversation: boolean;
  user: boolean;
  agent: boolean;
}

/**
 * Every state a task can report.
 *
 * Four of these are declared but not yet produced: nothing pauses a task or
 * waits for a tool, an approval or a user until tools and policies exist. They
 * are in the union so adding them later is not a breaking change.
 */
export type TaskStatus =
  | "queued"
  | "running"
  | "waiting_for_tool"
  | "waiting_for_approval"
  | "waiting_for_user"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

/** Work that outlives the request that asked for it. */
export interface Task {
  id: string;
  agent_id: string;
  /** Pinned when the task was queued, not when it runs. */
  agent_version: string;
  version_digest: string;
  status: TaskStatus;
  input: string;
  output: string | null;
  error: string | null;
  /** Where the trace, events and cost live. Null until a worker starts it. */
  run_id: string | null;
  conversation_id: string | null;
  user_id: string | null;
  attempt: number;
  max_attempts: number;
  /** Set while a failed task waits out its backoff. */
  run_after: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/**
 * A credential you gave us so an agent can reach something of yours.
 *
 * There is no `value`: the API has no route that returns one. Everything that
 * uses a secret names it, so a configuration can be read and versioned without
 * the credential travelling with it.
 */
export interface Secret {
  id: string;
  name: string;
  description: string | null;
  /** A few characters, enough to tell two secrets apart and useless otherwise. */
  hint: string;
  created_at: string;
  updated_at: string;
}

/** Remote only. `stdio` would mean running your process inside our runtime. */
export type McpTransport = "http" | "sse";

/**
 * How an end user's credential for a server was obtained.
 *
 * `api_key` is supplied directly and does not expire. `oauth2` sends the user
 * through a consent screen and expires. `session` is a session identifier a
 * tool on the server returns, with nothing to refresh it — expiry means
 * signing in again, which is why it is not a short-lived `oauth2`.
 */
export type McpConnectionScheme = "api_key" | "oauth2" | "session";

/**
 * How Nixet proves who it is to your server.
 *
 * The first four name a stored secret rather than carrying a token, so a
 * configuration can be read and copied without the credential. `oauth` is an
 * access token you obtained yourself: Nixet does not run that flow, so an
 * expired token is replaced rather than refreshed.
 *
 * `per_user` names no secret at all. The credential belongs to an end user
 * rather than the workspace, so the server is registered once and a run
 * resolves whose account it reaches from the user it names. Without it, the
 * same URL for every user would need one registration per user, and that
 * would force one agent version per user.
 */
export type McpAuth =
  | { type: "none" }
  | { type: "bearer"; secret: string }
  | { type: "header"; header: string; secret: string }
  | { type: "oauth"; secret: string }
  | { type: "per_user"; scheme: McpConnectionScheme };

/** What a tool does, as far as anyone can tell. */
export type ToolTag = "read" | "write" | "destructive" | "external";

/** What Nixet does when an agent reaches for a tool. */
export type ToolPolicy = "allow" | "ask" | "deny";

/**
 * A tool your server advertised the last time we asked.
 *
 * `tags` are a claim rather than a guarantee. Where they came from the server's
 * own annotations, that is the server describing itself, and the MCP
 * specification is explicit that a server can claim `readOnlyHint: true` and
 * delete your files anyway. Tags decide what you are shown and which default
 * applies; what Nixet permits is the policy, and that is yours.
 */
export interface McpTool {
  id: string;
  server_id: string;
  /** The handle an agent version pins, and how a policy addresses this tool. */
  server_name: string;
  name: string;
  description: string | null;
  tags: ToolTag[];
  /** `server` where it annotated itself, `inferred` where we read the name. */
  tag_source: "server" | "inferred";
  annotations: Record<string, unknown> | null;
  /** What this tool gets when a version does not name it. */
  default_policy: ToolPolicy;
  discovered_at: string;
  updated_at: string;
}

export interface McpServer {
  id: string;
  /** The handle an agent version pins, e.g. `github`. */
  name: string;
  description: string | null;
  transport: McpTransport;
  url: string;
  auth: McpAuth;
  /** Discovered at registration. Zero where the server could not be reached. */
  tool_count: number;
  tools_refreshed_at: string | null;
  /** Why the last connection failed, when it did. */
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/** Where a source's content came from. */
export type SourceKind = "file" | "text" | "url";

/**
 * How far a source has got.
 *
 * Named after the step in progress rather than a generic "processing", so a
 * customer waiting on a slow document can see whether it is being OCR'd — the
 * one step that takes minutes rather than milliseconds. `ready` and `failed`
 * are the only states nothing further happens from.
 */
export type SourceStatus =
  | "pending"
  | "converting"
  | "ocr"
  | "chunking"
  | "embedding"
  | "ready"
  | "failed";

/**
 * How a collection splits a document.
 *
 * `markdown` follows headings, which suits documents with a structure worth
 * preserving. `recursive` splits on paragraph and sentence boundaries and is
 * the safe default for prose that has none.
 */
export type ChunkStrategy = "markdown" | "recursive";

/**
 * A named index an agent version pins so it can search your own documents.
 *
 * The chunk settings are fixed at creation. Half a collection split at 1000
 * characters and half at 400 retrieves badly, and there is no honest way to
 * report which half a run searched, so re-chunking means another collection
 * rather than an edit to this one.
 */
export interface KnowledgeCollection {
  id: string;
  /** The handle a version pins, e.g. `support-policies`. */
  name: string;
  description: string | null;
  chunk_strategy: ChunkStrategy;
  chunk_size: number;
  chunk_overlap: number;
  /**
   * The model that embedded every chunk in here. Reported rather than chosen:
   * the vectors in one collection are only comparable because one model
   * produced them all.
   */
  embedding_model: string;
  /** Sources in this collection, whatever their status. */
  source_count: number;
  /** Chunks across every source that reached `ready`. */
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * One document inside a collection.
 *
 * The chunks it produced are not here: they carry an embedding and live beside
 * the vector index that searches them, so a hundred chunks of one PDF are not
 * returned in a response about that PDF. Neither is the document's own text —
 * this describes a document rather than containing it.
 */
export interface KnowledgeSource {
  id: string;
  collection_id: string;
  /** The collection's handle, so a source reads without a second call. */
  collection_name: string;
  kind: SourceKind;
  /** A file's original name, a URL, or a title given to pasted text. */
  title: string;
  /** Whether an agent can search this yet. Ingestion happens after the call. */
  status: SourceStatus;
  /** Why ingestion failed, when it did. */
  error: string | null;
  /** Bytes of the original. Zero for text that was pasted rather than uploaded. */
  size: number;
  mime_type: string | null;
  checksum: string | null;
  /** How many chunks this source produced. Zero until it is `ready`. */
  chunk_count: number;
  /**
   * Pages that needed OCR, and how many there were, so "2 of 340 pages were
   * scanned" answers why ingestion was slow.
   */
  ocr_pages: number[] | null;
  page_count: number | null;
  /**
   * The page a `url` source was actually read from, when a redirect moved it.
   * Null when nothing redirected, and for every other kind — `title` holds the
   * address that was asked for either way.
   */
  fetched_url: string | null;
  /**
   * Increments when a source is re-ingested. The chunks of an older generation
   * stay in the store, so a run that already happened can still be explained
   * by what it actually searched.
   */
  generation: number;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  agent_id: string;
  /** Pinned at creation, so a long thread cannot change behaviour. */
  agent_version: string | null;
  user_id: string | null;
  title: string | null;
  status: "open" | "closed";
  memory: MemoryPolicy;
  message_count: number;
  last_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  /** Monotonic within a conversation. */
  sequence: number;
  role: "user" | "assistant" | "system" | "summary";
  content: string;
  run_id: string | null;
  token_count: number | null;
  created_at: string;
}

/** What a send returns: the reply, and the run that produced it. */
export interface SendMessageResponse {
  message: ConversationMessage;
  run_id: string;
  usage: { input_tokens: number; output_tokens: number } | null;
  cost_usd: number | null;
}

/** Who a memory belongs to. */
export type MemoryScope = "conversation" | "user" | "agent";

/** A remembered fact. */
export interface MemoryRow {
  id: string | null;
  content: string;
  /** Similarity to the query, 0 to 1. Null when not from a search. */
  score: number | null;
  scope: MemoryScope;
  metadata: Record<string, unknown>;
  /**
   * Set when a later fact replaced this one. The store adds rather than
   * updates, so both survive and the older is marked instead of removed.
   */
  superseded: boolean;
  superseded_by: string | null;
  /** Set when a memory stops being recalled after a date. */
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}
