import type { Transport } from "../transport.js";
import type { Connection, ConnectionStatus } from "@nixet/contracts";
import type { ListParams, Page } from "../types.js";

export interface CreateConnectionParams {
  /** The end user this credential belongs to, as `usr_…`. */
  userId: string;
  /** A registered MCP server whose `auth.type` is `per_user`. */
  server: string;
  /** The credential. Stored encrypted and never returned. */
  value: string;
  /**
   * When it stops working, if you know.
   *
   * Trusted when given: an opaque token says nothing about its own lifetime,
   * so Nixet cannot infer this. Omitted means no known expiry, and a run will
   * use the credential until the provider refuses it.
   */
  expiresAt?: string;
  /** The refresh token, where the provider issued one. */
  refreshValue?: string;
}

export interface ListConnectionParams extends ListParams {
  userId?: string;
  server?: string;
  status?: ConnectionStatus;
}

/**
 * Connections: an end user's credential for a server you registered once.
 *
 * The split that makes this worth having. A server registration carries one
 * credential, which is right for an integration you own — your GitHub, your
 * internal API. It is wrong when every end user links their own account,
 * because the URL is identical for all of them and only the token differs. A
 * registration per user would force an agent version per user, and version
 * history would stop describing behaviour and become a credential registry.
 *
 * So the provider is registered once with `auth: { type: "per_user" }`, and a
 * connection binds one user to one credential for it. A run naming a user
 * reaches that user's account; the version still decides which servers and
 * which tools, because that is a capability rather than an identity.
 *
 * ```ts
 * await nixet.mcpServers.create({
 *   name: "broker",
 *   url: "https://mcp.broker.com/mcp",
 *   auth: { type: "per_user", scheme: "api_key" },
 * });
 *
 * await nixet.connections.create({
 *   userId: user.id,
 *   server: "broker",
 *   value: userSuppliedKey,
 * });
 *
 * // The run picks the credential up from the user it names.
 * await nixet.runs.create(agentId, { input: "What do I hold?", userId: user.id });
 * ```
 *
 * A credential is write-only: nothing here returns one, and there is no
 * method that could. A read gives back the scheme, the status and the expiry.
 *
 * `revoke` rather than delete. A run recorded that it authenticated as a
 * connection, and removing the row would leave that run unexplainable, so the
 * credential is erased and the record of it is not.
 *
 * A missing or expired connection fails the run rather than calling the
 * server unauthenticated. Reaching someone's broker as nobody is worse than a
 * refused run, and nothing outside would reveal it had happened.
 */
export class Connections {
  constructor(private readonly transport: Transport) {}

  /**
   * Store a credential the user already holds.
   *
   * For an `api_key` server, where there is nothing to redirect the user
   * through. Also how a platform that runs its own OAuth pushes a fresh token:
   * creating again for the same user and server replaces nothing, so revoke
   * the old one first.
   */
  create(
    params: CreateConnectionParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<Connection> {
    return this.transport.request<Connection>({
      method: "POST",
      path: "/mcp/connections",
      body: {
        user_id: params.userId,
        server: params.server,
        value: params.value,
        ...(params.expiresAt ? { expires_at: params.expiresAt } : {}),
        ...(params.refreshValue ? { refresh_value: params.refreshValue } : {}),
      },
      signal: options.signal,
    });
  }

  list(
    params: ListConnectionParams = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<Page<Connection>> {
    return this.transport.requestPage<Connection>({
      method: "GET",
      path: "/mcp/connections",
      // Mapped rather than spread: `$limit` is the wire name and `limit` is
      // what a caller writes, and spreading would send both.
      query: {
        $limit: params.limit,
        $offset: params.offset,
        user_id: params.userId,
        server: params.server,
        status: params.status,
      },
      signal: options.signal,
    });
  }

  retrieve(id: string, options: { signal?: AbortSignal } = {}): Promise<Connection> {
    return this.transport.request<Connection>({
      method: "GET",
      path: `/mcp/connections/${id}`,
      signal: options.signal,
    });
  }

  /** Erase the credential and keep the record that it existed. */
  revoke(id: string, options: { signal?: AbortSignal } = {}): Promise<Connection> {
    return this.transport.request<Connection>({
      method: "DELETE",
      path: `/mcp/connections/${id}`,
      signal: options.signal,
    });
  }
}
