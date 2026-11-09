import type { Transport } from "../transport.js";
import type { ListParams, Page, Skill, SkillVersion, ToolRef } from "../types.js";

export interface CreateSkillParams {
  /** Lowercase, optionally namespaced as `group/name`. */
  name: string;
  description?: string;
  /** Supplying instructions also publishes the first version. */
  instructions?: string;
  tools?: (ToolRef | string)[];
}

export interface CreateSkillVersionParams {
  instructions: string;
  tools?: (ToolRef | string)[];
  /** Make this the version bare references resolve to. Defaults to true. */
  publish?: boolean;
}

/**
 * Skills: reusable expertise an agent can use.
 *
 * A skill is instructions plus the tools that expertise needs, versioned like
 * an agent. An agent version references one as `name` or `name@v2`.
 */
export class Skills {
  constructor(private readonly transport: Transport) {}

  /**
   * Create a skill, optionally publishing its first version.
   *
   * ```ts
   * await nixet.skills.create({
   *   name: "research/company-lookup",
   *   instructions: "State the industry and size of any company asked about.",
   *   tools: ["current_time"],
   * });
   * ```
   */
  async create(
    params: CreateSkillParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<Skill & { version?: SkillVersion }> {
    const skill = await this.transport.request<Skill>({
      method: "POST",
      path: "/skills",
      body: {
        name: params.name,
        ...(params.description ? { description: params.description } : {}),
      },
      signal: options.signal,
    });

    if (!params.instructions) return skill;

    const version = await this.versions.create(
      skill.id,
      { instructions: params.instructions, tools: params.tools },
      options,
    );

    // The skill was read before the version published, so its pointer is stale.
    return { ...skill, current_version: version.version, version };
  }

  async retrieve(skillId: string, options: { signal?: AbortSignal } = {}): Promise<Skill> {
    return this.transport.request<Skill>({
      method: "GET",
      path: `/skills/${encodeURIComponent(skillId)}`,
      signal: options.signal,
    });
  }

  async list(
    params: ListParams = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<Page<Skill>> {
    return this.transport.requestPage<Skill>({
      method: "GET",
      path: "/skills",
      query: { $limit: params.limit, $offset: params.offset },
      signal: options.signal,
    });
  }

  /** Immutable versions of a skill. */
  readonly versions = {
    create: async (
      skillId: string,
      params: CreateSkillVersionParams,
      options: { signal?: AbortSignal } = {},
    ): Promise<SkillVersion> =>
      this.transport.request<SkillVersion>({
        method: "POST",
        path: `/skills/${encodeURIComponent(skillId)}/versions`,
        body: {
          instructions: params.instructions,
          ...(params.tools ? { tools: params.tools.map(toToolRef) } : {}),
          ...(params.publish === undefined ? {} : { publish: params.publish }),
        },
        signal: options.signal,
      }),

    list: async (
      skillId: string,
      params: ListParams = {},
      options: { signal?: AbortSignal } = {},
    ): Promise<Page<SkillVersion>> =>
      this.transport.requestPage<SkillVersion>({
        method: "GET",
        path: `/skills/${encodeURIComponent(skillId)}/versions`,
        query: { $limit: params.limit, $offset: params.offset },
        signal: options.signal,
      }),
  };
}

const toToolRef = (tool: ToolRef | string): ToolRef =>
  typeof tool === "string" ? { name: tool } : tool;
