import { RunStream } from "../stream.js";
import type { Transport } from "../transport.js";
import type { ListParams, Page, Provider, Run, RunEvent } from "../types.js";

export interface CreateRunParams {
  /** Message sent to the agent. */
  input: string;
  /** Pin a specific version. Defaults to the agent's published one. */
  version?: string;
  /** Override the version's provider for this run only. */
  provider?: Provider;
  /** Group related runs into one conversation. */
  sessionId?: string;
  /** Who the agent is serving. Decides whose MCP connections it may use. */
  userId?: string;
  /**
   * Values for the placeholders the version declared.
   *
   * A version whose instructions hold `{{data_context}}` requires it here.
   * Every declared placeholder must be supplied and nothing else may be: an
   * unknown key is refused rather than ignored, so a caller cannot reach a
   * slot the version never named.
   */
  variables?: Record<string, string>;
  /**
   * Narrow this run to some of the version's MCP servers.
   *
   * A subset, never an addition — the version's list is the boundary of what
   * the agent may reach. Useful when a user has connected one provider of
   * three and the run should use that one rather than failing on the others.
   */
  mcpServers?: string[];
}

export interface ListEventsParams extends ListParams {
  /** Return only events after this sequence number, to resume a lost stream. */
  after?: number;
  type?: RunEvent["type"];
}

/**
 * Agent execution.
 *
 * `create` waits and returns the finished run; `stream` returns events as they
 * are produced. Both record the same run, so a stream that drops can still be
 * read afterwards.
 */
export class Runs {
  constructor(private readonly transport: Transport) {}

  /** Run an agent and wait for it to finish. */
  async create(
    agentId: string,
    params: CreateRunParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<Run> {
    return this.transport.request<Run>({
      method: "POST",
      path: `/agents/${encodeURIComponent(agentId)}/runs`,
      body: toBody(params),
      signal: options.signal,
    });
  }

  /**
   * Run an agent and receive events as they happen.
   *
   * ```ts
   * const stream = await nixet.runs.stream(agentId, { input: "Hello" });
   * for await (const chunk of stream.chunks()) process.stdout.write(chunk);
   * ```
   */
  async stream(
    agentId: string,
    params: CreateRunParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<RunStream> {
    const response = await this.transport.stream({
      method: "POST",
      path: `/agents/${encodeURIComponent(agentId)}/runs/stream`,
      body: toBody(params),
      signal: options.signal,
    });
    return new RunStream(response);
  }

  async retrieve(runId: string, options: { signal?: AbortSignal } = {}): Promise<Run> {
    return this.transport.request<Run>({
      method: "GET",
      path: `/runs/${encodeURIComponent(runId)}`,
      signal: options.signal,
    });
  }

  async list(
    agentId: string,
    params: ListParams = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<Page<Run>> {
    return this.transport.requestPage<Run>({
      method: "GET",
      path: `/agents/${encodeURIComponent(agentId)}/runs`,
      query: { $limit: params.limit, $offset: params.offset },
      signal: options.signal,
    });
  }

  /**
   * The recorded event log.
   *
   * Pass `after` to resume from the last event already seen, rather than
   * running the agent again.
   */
  async events(
    runId: string,
    params: ListEventsParams = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<Page<RunEvent>> {
    return this.transport.requestPage<RunEvent>({
      method: "GET",
      path: `/runs/${encodeURIComponent(runId)}/events`,
      query: {
        "sequence[$gt]": params.after,
        type: params.type,
        $limit: params.limit,
        $offset: params.offset,
      },
      signal: options.signal,
    });
  }
}

const toBody = (params: CreateRunParams) => ({
  input: params.input,
  ...(params.version ? { agent_version: params.version } : {}),
  ...(params.provider ? { provider: params.provider } : {}),
  ...(params.sessionId ? { session_id: params.sessionId } : {}),
  ...(params.userId ? { user_id: params.userId } : {}),
  ...(params.variables ? { variables: params.variables } : {}),
  ...(params.mcpServers ? { mcp_servers: params.mcpServers } : {}),
});
