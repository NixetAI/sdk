import type { Transport } from "../transport.js";
import type { MemoryRow, MemoryScope } from "../types.js";

/** Where a request may address memory. Every read and write names one. */
export interface MemoryTargetParams {
  agentId: string;
  userId?: string;
  conversationId?: string;
}

export interface SearchMemoryParams extends MemoryTargetParams {
  query: string;
  /** Narrow to one scope. Omit to search all the request can address. */
  scope?: MemoryScope;
  limit?: number;
}

export interface ListMemoryParams extends MemoryTargetParams {
  scope?: MemoryScope;
  limit?: number;
}

export interface CreateMemoryParams extends MemoryTargetParams {
  scope: MemoryScope;
  content: string;
  metadata?: Record<string, unknown>;
  /** ISO date after which the memory stops being recalled. */
  expiresAt?: string;
}

export interface UpdateMemoryParams extends MemoryTargetParams {
  content?: string;
  metadata?: Record<string, unknown>;
  /** Null clears an existing expiry. */
  expiresAt?: string | null;
}

function target(params: MemoryTargetParams) {
  return {
    agent_id: params.agentId,
    ...(params.userId ? { user_id: params.userId } : {}),
    ...(params.conversationId ? { conversation_id: params.conversationId } : {}),
  };
}



/**
 * Memory: what an agent retains about a person or a thread.
 *
 * Distinct from a conversation transcript, which is the literal record of what
 * was said. A memory is a fact worth keeping — a preference, a constraint, a
 * problem — extracted from conversations or written directly.
 *
 * ```ts
 * await nixet.memory.create({
 *   scope: "user",
 *   agentId: agent.id,
 *   userId: user.id,
 *   content: "Prefers metric units and short answers.",
 * });
 *
 * const found = await nixet.memory.search({
 *   query: "what are their preferences?",
 *   agentId: agent.id,
 *   userId: user.id,
 * });
 * ```
 */
export class MemoryResource {
  constructor(private readonly transport: Transport) {}

  /** Recall memories relevant to a query, most relevant first. */
  search(
    params: SearchMemoryParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<MemoryRow[]> {
    return this.transport.request<MemoryRow[]>({
      method: "POST",
      path: "/memory/search",
      body: {
        ...target(params),
        query: params.query,
        ...(params.scope ? { scope: params.scope } : {}),
        limit: params.limit ?? 10,
      },
      signal: options.signal,
    });
  }

  /**
   * Everything an agent holds, newest first.
   *
   * Use this to browse. `search` asks a question; this asks for the lot.
   */
  list(
    params: ListMemoryParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<MemoryRow[]> {
    return this.transport.request<MemoryRow[]>({
      method: "POST",
      path: "/memory/list",
      body: {
        ...target(params),
        ...(params.scope ? { scope: params.scope } : {}),
        limit: params.limit ?? 50,
      },
      signal: options.signal,
    });
  }

  /**
   * Store a memory directly.
   *
   * Use this for facts you already know — a plan tier, an account setting —
   * rather than waiting for them to be said in a conversation.
   */
  create(
    params: CreateMemoryParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<MemoryRow[]> {
    return this.transport.request<MemoryRow[]>({
      method: "POST",
      path: "/memory",
      body: {
        ...target(params),
        scope: params.scope,
        content: params.content,
        ...(params.metadata ? { metadata: params.metadata } : {}),
        ...(params.expiresAt ? { expires_at: params.expiresAt } : {}),
      },
      signal: options.signal,
    });
  }

  /** One memory by id. */
  get(
    memoryId: string,
    params: MemoryTargetParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<MemoryRow> {
    return this.transport.request<MemoryRow>({
      method: "GET",
      path: `/memory/${encodeURIComponent(memoryId)}`,
      query: target(params),
      signal: options.signal,
    });
  }

  /** Correct a memory in place. */
  update(
    memoryId: string,
    params: UpdateMemoryParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<MemoryRow> {
    return this.transport.request<MemoryRow>({
      method: "PATCH",
      path: `/memory/${encodeURIComponent(memoryId)}`,
      body: {
        ...target(params),
        ...(params.content !== undefined ? { content: params.content } : {}),
        ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
        ...(params.expiresAt !== undefined ? { expires_at: params.expiresAt } : {}),
      },
      signal: options.signal,
    });
  }

  /**
   * Forget a memory.
   *
   * The only way to erase what an agent knows about a person, so it is also
   * what an erasure request is served by.
   */
  delete(
    memoryId: string,
    params: MemoryTargetParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    return this.transport.request<void>({
      method: "DELETE",
      path: `/memory/${encodeURIComponent(memoryId)}`,
      query: target(params),
      signal: options.signal,
    });
  }
}
