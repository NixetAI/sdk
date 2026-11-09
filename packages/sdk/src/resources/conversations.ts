import type { Transport } from "../transport.js";
import type {
  Conversation,
  ConversationMessage,
  ListParams,
  MemoryPolicy,
  Page,
  SendMessageResponse,
} from "../types.js";

export interface CreateConversationParams {
  agentId: string;
  /** Who the thread is with. Memory is isolated per user. */
  userId?: string;
  title?: string;
  /** Pins a version, so a long thread cannot change behaviour mid-way. */
  agentVersion?: string;
  /** What the agent may remember. Everything is off unless asked for. */
  memory?: Partial<MemoryPolicy>;
}

export interface SendMessageParams {
  input: string;
  provider?: string;
}

/**
 * Conversations: a durable thread between an agent and a user.
 *
 * Each message creates a run, so cost, usage and the trace work exactly as
 * they do for a single-shot run. The conversation adds the history around them.
 *
 * ```ts
 * const convo = await nixet.conversations.create({
 *   agentId: agent.id,
 *   userId: user.id,
 * });
 *
 * await nixet.conversations.send(convo.id, { input: "Hi, I'm Sam." });
 * await nixet.conversations.send(convo.id, { input: "What's my name?" });
 * // → "Sam"
 * ```
 */
export class Conversations {
  constructor(private readonly transport: Transport) {}

  create(
    params: CreateConversationParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<Conversation> {
    return this.transport.request<Conversation>({
      method: "POST",
      path: "/conversations",
      body: {
        agent_id: params.agentId,
        ...(params.userId ? { user_id: params.userId } : {}),
        ...(params.title ? { title: params.title } : {}),
        ...(params.agentVersion ? { agent_version: params.agentVersion } : {}),
        ...(params.memory ? { memory: params.memory } : {}),
      },
      signal: options.signal,
    });
  }

  retrieve(
    conversationId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<Conversation> {
    return this.transport.request<Conversation>({
      method: "GET",
      path: `/conversations/${encodeURIComponent(conversationId)}`,
      signal: options.signal,
    });
  }

  list(
    params: ListParams & { agentId?: string; userId?: string } = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<Page<Conversation>> {
    return this.transport.requestPage<Conversation>({
      method: "GET",
      path: "/conversations",
      query: {
        $limit: params.limit,
        $offset: params.offset,
        agent_id: params.agentId,
        user_id: params.userId,
      },
      signal: options.signal,
    });
  }

  /** Send a message and wait for the reply. */
  send(
    conversationId: string,
    params: SendMessageParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<SendMessageResponse> {
    return this.transport.request<SendMessageResponse>({
      method: "POST",
      path: `/conversations/${encodeURIComponent(conversationId)}/messages`,
      body: {
        input: params.input,
        ...(params.provider ? { provider: params.provider } : {}),
      },
      signal: options.signal,
    });
  }

  /**
   * The full transcript, oldest first.
   *
   * Includes turns a summary has since replaced, so what a person actually
   * said is still readable even after the thread has been compacted.
   */
  messages(
    conversationId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<Page<ConversationMessage>> {
    return this.transport.requestPage<ConversationMessage>({
      method: "GET",
      path: `/conversations/${encodeURIComponent(conversationId)}/messages`,
      signal: options.signal,
    });
  }
}
