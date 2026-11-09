import { z } from "zod";

/**
 * Conversations.
 *
 * A durable thread between one agent and one user. Each message sent creates a
 * run, so cost, usage and the trace stay exactly as they are for a single-shot
 * run; the conversation adds the history around them.
 */

export const MAX_MESSAGE_LENGTH = 100_000;

/**
 * Which memories an agent may keep from this conversation.
 *
 * All default to off. The product rule is that an agent must not retain
 * information without being told to, so retention is something a caller asks
 * for rather than something they have to remember to switch off.
 */
export const memoryPolicySchema = z
  .object({
    conversation: z.boolean().default(false).describe("Facts within this thread."),
    user: z.boolean().default(false).describe("Facts about this person."),
    agent: z.boolean().default(false).describe("Facts shared by every user."),
  })
  .strict();
export type MemoryPolicy = z.infer<typeof memoryPolicySchema>;

export const conversationStatusSchema = z.enum(["open", "closed"]);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

export const conversationSchema = z.object({
  id: z.string().describe("Unique identifier, prefixed `cnv_`."),
  agent_id: z.string(),
  agent_version: z
    .string()
    .nullable()
    .describe("Pinned at creation, so a long thread cannot change behaviour."),
  user_id: z.string().nullable().describe("The person this thread is with."),
  title: z.string().nullable(),
  status: conversationStatusSchema,
  memory: memoryPolicySchema,
  message_count: z.number().int().nonnegative(),
  last_run_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const createConversationSchema = z
  .object({
    agent_id: z.string().min(1),
    user_id: z.string().min(1).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    memory: memoryPolicySchema.partial().optional(),
    /** Pins the agent version, so a long thread cannot change behaviour mid-way. */
    agent_version: z.string().min(1).optional(),
  })
  .strict();
export type CreateConversationRequest = z.infer<typeof createConversationSchema>;

export const messageRoleSchema = z.enum(["user", "assistant", "system", "summary"]);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const conversationMessageSchema = z.object({
  id: z.string().describe("Unique identifier, prefixed `msg_`."),
  conversation_id: z.string(),
  /** Monotonic within a conversation, so a transcript has a stable order. */
  sequence: z.number().int().nonnegative(),
  role: messageRoleSchema,
  content: z.string(),
  /** The run that produced an assistant message; null for anything else. */
  run_id: z.string().nullable(),
  token_count: z.number().int().nonnegative().nullable(),
  created_at: z.string(),
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

export const sendMessageSchema = z
  .object({
    input: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
    /** Overrides the model provider for this message only. */
    provider: z.string().min(1).optional(),
  })
  .strict();
export type SendMessageRequest = z.infer<typeof sendMessageSchema>;

/** What a send returns: the reply, plus the run that produced it. */
export const sendMessageResponseSchema = z.object({
  message: conversationMessageSchema,
  run_id: z.string(),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
    })
    .nullable(),
  cost_usd: z.number().nullable(),
});
export type SendMessageResponse = z.infer<typeof sendMessageResponseSchema>;
