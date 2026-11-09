import { z } from "zod";

/**
 * Memory.
 *
 * What an agent retains about a person or a thread, as opposed to the
 * transcript, which is the literal record of what was said.
 */

export const MAX_MEMORY_LENGTH = 4_000;

/**
 * Who a memory belongs to.
 *
 * `conversation` is this thread only, `user` follows a person across every
 * thread they have with an agent, and `agent` is shared by all of its users.
 */
export const memoryScopeSchema = z.enum(["conversation", "user", "agent"]);
export type MemoryScope = z.infer<typeof memoryScopeSchema>;

export const memorySchema = z.object({
  id: z.string(),
  scope: memoryScopeSchema,
  content: z.string().describe("The fact, as the agent would recall it."),
  metadata: z.record(z.string(), z.unknown()),
  /**
   * Set when a later fact replaced this one. The store adds rather than
   * updates, so both survive and the older is marked instead of removed.
   */
  superseded: z.boolean(),
  superseded_by: z.string().nullable(),
  /** Set when a memory should stop being recalled after a date. */
  expires_at: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export type Memory = z.infer<typeof memorySchema>;

/** A search hit, with how closely it matched. */
export const memoryMatchSchema = memorySchema.extend({
  score: z.number().nullable().describe("Similarity, 0 to 1. Higher is closer."),
});
export type MemoryMatch = z.infer<typeof memoryMatchSchema>;

/** Where a request may address memory. Every read and write names one. */
const target = {
  agent_id: z.string().min(1),
  user_id: z.string().min(1).optional(),
  conversation_id: z.string().min(1).optional(),
};

/**
 * A scope names what a memory is about, so the thing it is about has to be
 * present. Without this a `user` memory could be stored with no user.
 */
type Scoped = { scope?: MemoryScope; user_id?: string; conversation_id?: string };

function scopedToItsSubject<T extends z.ZodType<Scoped>>(schema: T) {
  return schema
    .refine((value) => value.scope !== "user" || Boolean(value.user_id), {
      message: "user_id is required for user-scoped memory.",
      path: ["user_id"],
    })
    .refine(
      (value) => value.scope !== "conversation" || Boolean(value.conversation_id),
      {
        message: "conversation_id is required for conversation-scoped memory.",
        path: ["conversation_id"],
      },
    );
}

export const createMemorySchema = scopedToItsSubject(
  z
    .object({
      ...target,
      scope: memoryScopeSchema,
      content: z.string().trim().min(1).max(MAX_MEMORY_LENGTH),
      metadata: z.record(z.string(), z.unknown()).optional(),
      expires_at: z.string().datetime().optional(),
    })
    .strict(),
);
export type CreateMemoryRequest = z.infer<typeof createMemorySchema>;

export const searchMemorySchema = scopedToItsSubject(
  z
    .object({
      ...target,
      query: z.string().trim().min(1).max(1_000),
      scope: memoryScopeSchema.optional(),
      limit: z.number().int().min(1).max(50).default(10),
    })
    .strict(),
);
export type SearchMemoryRequest = z.infer<typeof searchMemorySchema>;

export const listMemorySchema = scopedToItsSubject(
  z
    .object({
      ...target,
      scope: memoryScopeSchema.optional(),
      limit: z.number().int().min(1).max(100).default(50),
    })
    .strict(),
);
export type ListMemoryRequest = z.infer<typeof listMemorySchema>;

/** Addressing one memory. The scope is what proves it is ours to touch. */
export const memoryTargetSchema = z.object(target).strict();
export type MemoryTargetRequest = z.infer<typeof memoryTargetSchema>;

export const updateMemorySchema = z
  .object({
    ...target,
    content: z.string().trim().min(1).max(MAX_MEMORY_LENGTH).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    expires_at: z.string().datetime().nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.content !== undefined ||
      value.metadata !== undefined ||
      value.expires_at !== undefined,
    { message: "Nothing to update." },
  );
export type UpdateMemoryRequest = z.infer<typeof updateMemorySchema>;
