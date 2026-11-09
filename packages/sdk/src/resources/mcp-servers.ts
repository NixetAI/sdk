import type { Transport } from "../transport.js";
import type { ListParams, McpAuth, McpServer, McpTransport, Page } from "../types.js";

export interface CreateMcpServerParams {
  /** Lowercase and hyphenated. This is what an agent version pins. */
  name: string;
  url: string;
  /** Defaults to `http`. */
  transport?: McpTransport;
  description?: string;
  /** Defaults to `none`. Authenticated variants name a stored secret. */
  auth?: McpAuth;
}

export interface UpdateMcpServerParams {
  url?: string;
  transport?: McpTransport;
  description?: string;
  auth?: McpAuth;
}

/**
 * MCP servers: tools you run, used by agents we run.
 *
 * ```ts
 * await nixet.secrets.create({ name: "github-token", value: process.env.GH_PAT });
 *
 * const server = await nixet.mcpServers.create({
 *   name: "github",
 *   url: "https://mcp.example.com/mcp",
 *   auth: { type: "bearer", secret: "github-token" },
 * });
 *
 * // Registration discovers what the server offers. What an agent may do with
 * // each tool is a policy, set per version rather than per server.
 * const tools = await nixet.mcpServers.tools(server.id);
 *
 * await nixet.agents.versions.create(agent.id, {
 *   instructions: "Use the GitHub tools to answer questions about the repo.",
 *   mcpServers: [server.name],
 * });
 * ```
 *
 * Remote only: registering a `stdio` server would mean spawning your process
 * inside our runtime, so that transport does not exist rather than being
 * refused later. The URL is checked at registration against where Nixet is
 * willing to connect, so a private or loopback address is rejected then rather
 * than mid-run.
 *
 * A version names servers by handle, and the runtime connects at execution, so
 * changing a server's URL changes what a published version reaches without
 * republishing it. Its `name` is therefore fixed.
 */
export class McpServers {
  constructor(private readonly transport: Transport) {}

  create(
    params: CreateMcpServerParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<McpServer> {
    return this.transport.request<McpServer>({
      method: "POST",
      path: "/mcp/servers",
      body: {
        name: params.name,
        url: params.url,
        ...(params.transport ? { transport: params.transport } : {}),
        ...(params.description ? { description: params.description } : {}),
        ...(params.auth ? { auth: params.auth } : {}),
      },
      signal: options.signal,
    });
  }

  retrieve(serverId: string, options: { signal?: AbortSignal } = {}): Promise<McpServer> {
    return this.transport.request<McpServer>({
      method: "GET",
      path: `/mcp/servers/${encodeURIComponent(serverId)}`,
      signal: options.signal,
    });
  }

  list(
    params: ListParams & { name?: string } = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<Page<McpServer>> {
    return this.transport.requestPage<McpServer>({
      method: "GET",
      path: "/mcp/servers",
      query: {
        $limit: params.limit,
        $offset: params.offset,
        name: params.name,
      },
      signal: options.signal,
    });
  }

  /**
   * Change where a server lives or how it authenticates.
   *
   * Moving the URL discards the tools we recorded, because what the old host
   * advertised no longer describes the new one.
   */
  update(
    serverId: string,
    params: UpdateMcpServerParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<McpServer> {
    return this.transport.request<McpServer>({
      method: "PATCH",
      path: `/mcp/servers/${encodeURIComponent(serverId)}`,
      body: {
        ...(params.url ? { url: params.url } : {}),
        ...(params.transport ? { transport: params.transport } : {}),
        ...(params.description === undefined ? {} : { description: params.description }),
        ...(params.auth ? { auth: params.auth } : {}),
      },
      signal: options.signal,
    });
  }

  /**
   * Remove a server.
   *
   * A published version that named it can no longer be run, because a version
   * is frozen and cannot be edited to drop the reference.
   */
  del(serverId: string, options: { signal?: AbortSignal } = {}): Promise<McpServer> {
    return this.transport.request<McpServer>({
      method: "DELETE",
      path: `/mcp/servers/${encodeURIComponent(serverId)}`,
      signal: options.signal,
    });
  }
}
