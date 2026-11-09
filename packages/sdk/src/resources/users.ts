import type { Transport } from "../transport.js";
import type { ListParams, Page, User } from "../types.js";

export interface CreateUserParams {
  /** Your own identifier for this person. Unique within your workspace. */
  reference: string;
  email?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Users: the people your agent serves.
 *
 * Not the people who sign into the Nixet console — those are members. A user
 * is yours: you supply the reference, and memory is isolated per user so one
 * of your customers can never read another's.
 */
export class Users {
  constructor(private readonly transport: Transport) {}

  /**
   * Register a user.
   *
   * ```ts
   * const user = await nixet.users.create({ reference: "acme_user_8821" });
   * ```
   */
  create(
    params: CreateUserParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<User> {
    return this.transport.request<User>({
      method: "POST",
      path: "/users",
      body: {
        reference: params.reference,
        ...(params.email ? { email: params.email } : {}),
        ...(params.name ? { name: params.name } : {}),
        ...(params.metadata ? { metadata: params.metadata } : {}),
      },
      signal: options.signal,
    });
  }

  retrieve(userId: string, options: { signal?: AbortSignal } = {}): Promise<User> {
    return this.transport.request<User>({
      method: "GET",
      path: `/users/${encodeURIComponent(userId)}`,
      signal: options.signal,
    });
  }

  /** Filter by `reference` to find a person by your own identifier. */
  list(
    params: ListParams & { reference?: string } = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<Page<User>> {
    return this.transport.requestPage<User>({
      method: "GET",
      path: "/users",
      query: {
        $limit: params.limit,
        $offset: params.offset,
        reference: params.reference,
      },
      signal: options.signal,
    });
  }
}
