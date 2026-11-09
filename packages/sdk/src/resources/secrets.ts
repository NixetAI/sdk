import type { Transport } from "../transport.js";
import type { ListParams, Page, Secret } from "../types.js";

export interface CreateSecretParams {
  /** Lowercase and hyphenated. A version pins this, so it cannot change. */
  name: string;
  value: string;
  description?: string;
}

export interface UpdateSecretParams {
  /** Replaces the stored credential. */
  value?: string;
  description?: string;
}

/**
 * Secrets: credentials you give us so an agent can reach something of yours.
 *
 * ```ts
 * await nixet.secrets.create({ name: "github-token", value: process.env.GH_PAT });
 *
 * await nixet.mcpServers.create({
 *   name: "github",
 *   url: "https://mcp.example.com/mcp",
 *   auth: { type: "bearer", secret: "github-token" },
 * });
 * ```
 *
 * A value is written once and never returned — `retrieve` and `list` carry a
 * name and a hint, and no route exists that could answer with the credential.
 * To rotate one, store a new value under the same name; whatever refers to it
 * picks the new value up on the next run.
 */
export class Secrets {
  constructor(private readonly transport: Transport) {}

  create(
    params: CreateSecretParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<Secret> {
    return this.transport.request<Secret>({
      method: "POST",
      path: "/secrets",
      body: {
        name: params.name,
        value: params.value,
        ...(params.description ? { description: params.description } : {}),
      },
      signal: options.signal,
    });
  }

  /** Metadata only. The value is not part of this response by design. */
  retrieve(secretId: string, options: { signal?: AbortSignal } = {}): Promise<Secret> {
    return this.transport.request<Secret>({
      method: "GET",
      path: `/secrets/${encodeURIComponent(secretId)}`,
      signal: options.signal,
    });
  }

  list(
    params: ListParams & { name?: string } = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<Page<Secret>> {
    return this.transport.requestPage<Secret>({
      method: "GET",
      path: "/secrets",
      query: {
        $limit: params.limit,
        $offset: params.offset,
        name: params.name,
      },
      signal: options.signal,
    });
  }

  /** Replace the value, or the description. The name is fixed. */
  update(
    secretId: string,
    params: UpdateSecretParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<Secret> {
    return this.transport.request<Secret>({
      method: "PATCH",
      path: `/secrets/${encodeURIComponent(secretId)}`,
      body: {
        ...(params.value === undefined ? {} : { value: params.value }),
        ...(params.description === undefined ? {} : { description: params.description }),
      },
      signal: options.signal,
    });
  }

  /**
   * Delete a secret.
   *
   * Anything that names it stops authenticating, so a published version
   * referring to this secret will start failing against its server.
   */
  del(secretId: string, options: { signal?: AbortSignal } = {}): Promise<Secret> {
    return this.transport.request<Secret>({
      method: "DELETE",
      path: `/secrets/${encodeURIComponent(secretId)}`,
      signal: options.signal,
    });
  }
}
