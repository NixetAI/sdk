import { z } from "zod";
import { memoryPolicySchema } from "./conversations.js";
import { providerSchema } from "./agents.js";

/**
 * Tasks.
 *
 * A run is one HTTP request: the caller waits, and the work has to finish
 * inside that request. A task is work that outlives the request — research,
 * a long report, anything that would otherwise time out.
 *
 * A task owns the lifecycle; a run owns the execution. The worker starts a run
 * and records its id, so a task's trace, cost and redaction are the run's and
 * nothing is duplicated.
 */

/**
 * Every state a task can report.
 *
 * Five are reachable today. `waiting_for_tool`, `waiting_for_approval`,
 * `waiting_for_user` and `paused` are declared because the platform will
 * produce them once tools, policies and a resume mechanism exist — widening a
 * published enum later would break an exhaustive switch a customer already
 * wrote. Until then nothing sets them, and the documentation says so.
 */
export const taskStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_for_tool",
  "waiting_for_approval",
  "waiting_for_user",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/** States nothing currently produces. Exported so the docs cannot drift. */
export const UNREACHABLE_TASK_STATES: readonly TaskStatus[] = [
  "waiting_for_tool",
  "waiting_for_approval",
  "waiting_for_user",
  "paused",
];

/** A task that has stopped for good, whatever the outcome. */
export const TERMINAL_TASK_STATES: readonly TaskStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

export const MAX_TASK_INPUT = 32_000;
export const DEFAULT_MAX_ATTEMPTS = 3;

export const taskSchema = z.object({
  id: z.string().describe("Unique identifier, prefixed `tsk_`."),
  agent_id: z.string(),
  agent_version: z
    .string()
    .describe("Pinned when the task is queued, not when it runs."),
  version_digest: z
    .string()
    .describe("Content hash of the configuration that will produce this task."),
  status: taskStatusSchema,
  input: z.string(),
  output: z
    .string()
    .nullable()
    .describe("Final text, present once the task completes."),
  error: z
    .string()
    .nullable()
    .describe("Safe failure reason. Never a stack trace or provider payload."),
  /** Where the trace, events and cost live. Null until a worker starts it. */
  run_id: z.string().nullable(),
  conversation_id: z.string().nullable(),
  user_id: z.string().nullable(),
  attempt: z.number().int().nonnegative().describe("Attempts started so far."),
  max_attempts: z.number().int().positive(),
  /** Set when a failed task is waiting out its backoff before the next attempt. */
  run_after: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
});
export type Task = z.infer<typeof taskSchema>;

export const createTaskSchema = z
  .object({
    input: z.string().trim().min(1).max(MAX_TASK_INPUT),
    /** Pins a version. Defaults to whatever is published when queued. */
    agent_version: z.string().min(1).optional(),
    conversation_id: z.string().min(1).optional(),
    user_id: z.string().min(1).optional(),
    provider: providerSchema.optional(),
    memory: memoryPolicySchema.partial().optional(),
    max_attempts: z.number().int().min(1).max(10).default(DEFAULT_MAX_ATTEMPTS),
  })
  .strict();
export type CreateTaskRequest = z.infer<typeof createTaskSchema>;

export const listTasksSchema = z
  .object({
    status: taskStatusSchema.optional(),
    agent_id: z.string().min(1).optional(),
    conversation_id: z.string().min(1).optional(),
  })
  .strict();
export type ListTasksRequest = z.infer<typeof listTasksSchema>;

/**
 * How long to wait before attempt `n`.
 *
 * Exponential from ten seconds, capped at five minutes. A failure is usually a
 * rate limit or a provider blip, so retrying immediately tends to fail the same
 * way; waiting an hour is longer than anyone will tolerate.
 */
export function backoffMs(attempt: number): number {
  return Math.min(10_000 * 2 ** Math.max(0, attempt - 1), 300_000);
}
