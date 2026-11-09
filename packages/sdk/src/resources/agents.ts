import type { Transport } from "../transport.js";
import type {
  Agent,
  AgentVersion,
  ListParams,
  ModelConfig,
  Page,
  ToolPolicy,
  ToolRef,
} from "../types.js";
import type { CreateVersionParams, Versions } from "./versions.js";

export interface CreateAgentParams {
  name: string;
  description?: string;
  /**
   * Publish a first version at the same time.
   *
   * An agent without a version cannot run, so creating both in one call is the
   * common case. Omit this to create the identity alone.
   */
  instructions?: string;
  model?: ModelConfig;
  tools?: (ToolRef | string)[];
  /** Skills the agent uses, as `name` or `name@v2`. */
  skills?: string[];
  /** Names of registered MCP servers the agent may use. */
  mcpServers?: string[];
  /** Per-tool overrides as `server.tool`. Only the exceptions. */
  toolPolicies?: Record<string, ToolPolicy>;
  /** Knowledge collections this agent may search, by name. */
  knowledgeCollections?: string[];
  /** Placeholders in `instructions`, as `{{name}}`, that a run supplies. */
  variables?: string[];
  /** Guardrails to run, by name, per stage. */
  guardrails?: CreateVersionParams["guardrails"];
}

export interface CreatedAgent extends Agent {
  /** Present when `instructions` were supplied. */
  version?: AgentVersion;
}

/**
 * Agents.
 *
 * An agent is an identity; its behaviour lives in versions. `create` accepts
 * instructions so that the usual case is one call rather than two.
 */
export class Agents {
  constructor(
    private readonly transport: Transport,
    /** Sub-resource, so `nixet.agents.versions.create(...)` reads naturally. */
    readonly versions: Versions,
  ) {}

  /**
   * Create an agent, optionally publishing its first version.
   *
   * ```ts
   * const agent = await nixet.agents.create({
   *   name: "Support Assistant",
   *   instructions: "You are concise.",
   *   model: { provider: "nix", tier: "fast" },
   *   tools: ["calculate"],
   * });
   * ```
   */
  async create(
    params: CreateAgentParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<CreatedAgent> {
    const agent = await this.transport.request<Agent>({
      method: "POST",
      path: "/agents",
      body: {
        name: params.name,
        ...(params.description ? { description: params.description } : {}),
      },
      signal: options.signal,
    });

    if (!params.instructions) return agent;

    const version = await this.versions.create(
      agent.id,
      {
        instructions: params.instructions,
        model: params.model,
        tools: params.tools,
        skills: params.skills,
        mcpServers: params.mcpServers,
        toolPolicies: params.toolPolicies,
        knowledgeCollections: params.knowledgeCollections,
        variables: params.variables,
        guardrails: params.guardrails,
      },
      options,
    );

    // The agent was fetched before the version published, so its pointer is
    // stale. Reflect the version that now exists rather than returning null.
    return { ...agent, current_version: version.version, version };
  }

  async retrieve(agentId: string, options: { signal?: AbortSignal } = {}): Promise<Agent> {
    return this.transport.request<Agent>({
      method: "GET",
      path: `/agents/${encodeURIComponent(agentId)}`,
      signal: options.signal,
    });
  }

  async list(
    params: ListParams = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<Page<Agent>> {
    return this.transport.requestPage<Agent>({
      method: "GET",
      path: "/agents",
      query: { $limit: params.limit, $offset: params.offset },
      signal: options.signal,
    });
  }
}
