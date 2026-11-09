import type { Transport } from "../transport.js";
import type {
  AgentVersion,
  ListParams,
  ModelConfig,
  Page,
  RedactionPolicyInput,
  ToolPolicy,
  ToolRef,
} from "../types.js";

export interface CreateVersionParams {
  /** System prompt that defines the agent's behaviour. */
  instructions: string;
  /** Defaults to the managed provider at its balanced tier. */
  model?: ModelConfig;
  /** Tools the agent may call. Unknown names are rejected at publish. */
  tools?: (ToolRef | string)[];
  /** Skills to use, as `name` or `name@v2`. Pinned at publish. */
  skills?: string[];
  /**
   * Mask personal data in run input and output before dispatch.
   *
   * Defaults to off. Traces are not redacted, and about one item in ten is
   * missed, so this reduces personal data rather than removing it.
   */
  redaction?: RedactionPolicyInput;
  /**
   * Names of registered MCP servers this version may use.
   *
   * Pinned by name rather than by id, so moving a server's URL changes what a
   * published version reaches without republishing it. Cannot be combined with
   * redaction: a masked run would hand tools placeholders instead of values.
   */
  mcpServers?: string[];
  /**
   * What this version may do with a tool, as `server.tool` to policy.
   *
   * Only the exceptions: anything unnamed takes the default its tags imply, so
   * a version does not need rewriting when a server adds a tool. Qualified by
   * server because two servers can both offer `search`.
   *
   * `ask` is refused at publish until approvals exist — nothing can pause a run
   * for a human yet, and a policy that cannot mean what it says should not
   * become runnable.
   */
  toolPolicies?: Record<string, ToolPolicy>;
  /**
   * Knowledge collections this version may search, by name.
   *
   * Named rather than embedded, so a document added after publishing is found
   * without a new version. A collection with no ready sources is not an error:
   * it returns nothing until one finishes ingesting.
   */
  knowledgeCollections?: string[];
  /**
   * Placeholders in `instructions`, as `{{name}}`, that a run supplies.
   *
   * Declared rather than inferred, and checked against the instructions at
   * publish: a placeholder used without being declared, or declared without
   * being used, is refused. Both are mistakes in a version, and a version is
   * immutable, so publish is the only time they are cheap to find.
   *
   * Declaring them is also what keeps a run from reaching a slot this version
   * never named — a run that could inject arbitrary prompt text would make
   * your own backend a prompt-injection surface.
   */
  variables?: string[];
  /**
   * Guardrails to run, by name, per stage.
   *
   * Created with `nixet.guardrails.create` and named here, the way MCP servers
   * and knowledge collections are. Order is the order given: under `run_all`
   * each guard sees the text the previous one produced, so four scrubbing
   * rules compose into one rewritten response rather than the last one
   * winning.
   *
   * `tool_result` is the stage worth not forgetting. A tool answering with
   * structured data reaches the caller without passing through the agent's
   * text, so an `output` guard never sees it.
   */
  guardrails?: {
    input?: string[];
    output?: string[];
    tool_result?: string[];
    /** Defaults to `run_all`. */
    mode?: "run_all" | "fail_fast";
    /** Defaults to `return_message`. */
    on_block?: "return_message" | "error";
  };
  /** Make this the version new runs use. Defaults to true. */
  publish?: boolean;
}

/**
 * Immutable snapshots of an agent's configuration.
 *
 * A published version is never edited, which is what lets a past run be
 * explained by the configuration it recorded.
 */
export class Versions {
  constructor(private readonly transport: Transport) {}

  /** Publish a new version. Returns it, numbered in order: v1, v2, v3. */
  async create(
    agentId: string,
    params: CreateVersionParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<AgentVersion> {
    return this.transport.request<AgentVersion>({
      method: "POST",
      path: `/agents/${encodeURIComponent(agentId)}/versions`,
      body: {
        instructions: params.instructions,
        ...(params.model ? { model: params.model } : {}),
        // A bare string is the common case, so accept it as shorthand.
        ...(params.tools ? { tools: params.tools.map(toToolRef) } : {}),
        ...(params.skills ? { skills: params.skills } : {}),
        // Named in the SDK's own casing, so a caller is not asked to know
        // which fields happen to reach the wire untouched.
        ...(params.redaction
          ? {
              redaction: {
                mode: params.redaction.mode,
                ...(params.redaction.reversible === undefined
                  ? {}
                  : { reversible: params.redaction.reversible }),
                ...(params.redaction.minimumConfidence === undefined
                  ? {}
                  : { minimum_confidence: params.redaction.minimumConfidence }),
                ...(params.redaction.labels ? { labels: params.redaction.labels } : {}),
                ...(params.redaction.retainFor
                  ? { retain_for: params.redaction.retainFor }
                  : {}),
              },
            }
          : {}),
        ...(params.mcpServers ? { mcp_servers: params.mcpServers } : {}),
        ...(params.toolPolicies ? { tool_policies: params.toolPolicies } : {}),
        ...(params.knowledgeCollections
          ? { knowledge_collections: params.knowledgeCollections }
          : {}),
        ...(params.variables ? { variables: params.variables } : {}),
        // Sent whole rather than field by field: the server defaults `mode`
        // and `on_block`, and a partial object here would be a second place
        // those defaults are decided.
        ...(params.guardrails ? { guardrails: params.guardrails } : {}),
        ...(params.publish === undefined ? {} : { publish: params.publish }),
      },
      signal: options.signal,
    });
  }

  async list(
    agentId: string,
    params: ListParams = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<Page<AgentVersion>> {
    return this.transport.requestPage<AgentVersion>({
      method: "GET",
      path: `/agents/${encodeURIComponent(agentId)}/versions`,
      query: { $limit: params.limit, $offset: params.offset },
      signal: options.signal,
    });
  }

  /** Retrieve one version by its label, such as `v1`. */
  async retrieve(
    agentId: string,
    version: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<AgentVersion> {
    return this.transport.request<AgentVersion>({
      method: "GET",
      path: `/agents/${encodeURIComponent(agentId)}/versions/${encodeURIComponent(version)}`,
      signal: options.signal,
    });
  }
}

const toToolRef = (tool: ToolRef | string): ToolRef =>
  typeof tool === "string" ? { name: tool } : tool;
