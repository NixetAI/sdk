import type { Transport } from "../transport.js";
import type { ListParams, McpTool, Page } from "../types.js";

/**
 * Tools: what your servers offer, and what agents may do with each.
 *
 * ```ts
 * const tools = await nixet.tools.list({ serverName: "github" });
 *
 * await nixet.agents.versions.create(agent.id, {
 *   instructions: "Use the GitHub tools to answer questions about the repo.",
 *   mcpServers: ["github"],
 *   toolPolicies: { "github.delete_repo": "deny" },
 * });
 * ```
 *
 * Read-only: a tool exists because a server advertised it, so there is nothing
 * here to create. Discovery runs when a server is registered and again when its
 * URL moves, which is why a server that could not be reached has none listed.
 *
 * Each tool carries `tags` and a `default_policy`, and the two are not the same
 * kind of thing. A tag is a claim — taken from the server's own annotations
 * where it published any, and from our reading of the name where it did not —
 * and the MCP specification is explicit that a server can claim `readOnlyHint`
 * and delete your files regardless. So tags decide what you are shown and which
 * default applies. What actually happens is the policy on the version, which is
 * yours to set.
 */
export class Tools {
  constructor(private readonly transport: Transport) {}

  /** One tool, by id. */
  retrieve(toolId: string, options: { signal?: AbortSignal } = {}): Promise<McpTool> {
    return this.transport.request<McpTool>({
      method: "GET",
      path: `/mcp/tools/${encodeURIComponent(toolId)}`,
      signal: options.signal,
    });
  }

  /** Every tool on record, or those of one server. */
  list(
    params: ListParams & { serverName?: string; name?: string } = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<Page<McpTool>> {
    return this.transport.requestPage<McpTool>({
      method: "GET",
      path: "/mcp/tools",
      query: {
        $limit: params.limit,
        $offset: params.offset,
        server_name: params.serverName,
        name: params.name,
      },
      signal: options.signal,
    });
  }
}
