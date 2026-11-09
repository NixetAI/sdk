import { z } from "zod";
import { redactionSummarySchema } from "./redaction.js";
import { MAX_VARIABLE_VALUE, providerSchema } from "./agents.js";

/**
 * Runs and their event stream.
 *
 * A run is the durable record of one execution: which version produced it, what
 * it returned, what it cost. Events are the live view of the same execution.
 */

export const runStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const usageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
});
export type Usage = z.infer<typeof usageSchema>;

export const runSchema = z.object({
  id: z.string().describe("Unique identifier, prefixed `run_`."),
  agent_id: z.string().describe("Agent that produced this run."),
  agent_version: z
    .string()
    .describe("Version pinned at admission. It cannot change mid-run."),
  variables: z
    .record(z.string(), z.string())
    .nullable()
    .describe("Placeholder values this run was given. Null when the version declared none."),
  version_digest: z
    .string()
    .describe("Content hash of the configuration that produced this run."),
  status: runStatusSchema.describe("Lifecycle state."),
  provider: providerSchema.describe(
    "Provider that served the run. The model behind `nix` is not disclosed.",
  ),
  input: z
    .string()
    .describe(
      "Message sent to the agent. Masked when the version redacts, so this is what was stored rather than what the caller sent.",
    ),
  output: z
    .string()
    .nullable()
    .describe(
      "Final text, present once the run reaches a terminal state. Masked when the version redacts.",
    ),
  redaction: redactionSummarySchema
    .nullable()
    .describe("What was masked, as counts. Null when the version does not redact."),
  error: z
    .string()
    .nullable()
    .describe("Safe failure reason. Never a stack trace or provider payload."),
  usage: usageSchema.nullable().describe("Token counts, present on completion."),
  latency_ms: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe("Wall-clock duration of the run."),
  trace_id: z.string().nullable().describe("Correlates this run with its trace."),
  cost_usd: z
    .number()
    .nullable()
    .describe("Total cost in USD, summed from the run's model calls."),
  session_id: z.string().nullable().describe("Conversation this run belongs to."),
  created_at: z.string().describe("RFC 3339 admission timestamp."),
  completed_at: z.string().nullable().describe("RFC 3339 completion timestamp."),
});
export type Run = z.infer<typeof runSchema>;

export const MAX_INPUT_LENGTH = 100_000;

export const createRunSchema = z
  .object({
    agent_id: z.string().min(1).describe("Agent to run. Taken from the path."),
    input: z.string().min(1).max(MAX_INPUT_LENGTH).describe("Message sent to the agent."),
    agent_version: z
      .string()
      .optional()
      .describe("Version to pin. Defaults to the agent's published version."),
    provider: providerSchema
      .optional()
      .describe("Override the version's provider for this run only."),
    session_id: z
      .string()
      .max(128)
      .optional()
      .describe("Groups related runs into one conversation."),
    stream: z.boolean().default(false).describe("Set by the streaming endpoint."),
    conversation_id: z
      .string()
      .max(64)
      .nullish()
      .describe("Set when a conversation dispatched this run."),
    user_id: z
      .string()
      .max(64)
      .nullish()
      .describe("Who the agent is serving."),
    /**
     * Narrow this run to some of the version's MCP servers.
     *
     * A subset, never an addition. The version's list is the boundary of what
     * the agent may reach, and a run that could name a server outside it would
     * be a run that could grant itself a tool the agent was never published
     * with — an unannotated tool defaults to `allow`, so the escalation would
     * be silent.
     *
     * Omitted means every server the version named, which is the common case:
     * a caller sends a user and lets their connections decide what is
     * reachable.
     */
    mcp_servers: z
      .array(z.string().min(1).max(64))
      .max(10)
      .optional()
      .describe("Subset of the version's MCP servers to use for this run."),
    /**
     * Values for the placeholders the version declared.
     *
     * Every declared variable must be supplied and nothing else may be: an
     * unknown key is refused rather than ignored, so a caller cannot reach a
     * slot the version never named, and a missing one is refused rather than
     * left blank, because a prompt with a hole in it is worse than a run that
     * did not start.
     *
     * The resolved values are recorded on the run. Without that, the
     * instructions a run actually used are unrecoverable, and a version digest
     * would no longer explain what the agent was told.
     */
    variables: z
      .record(z.string(), z.string().max(MAX_VARIABLE_VALUE))
      .optional()
      .describe("Values for the version's declared instruction placeholders."),
    /**
     * Prior turns, oldest first.
     *
     * Supplied by the conversation rather than stored on the run: the runtime
     * is stateless, so history has to travel with the request that needs it.
     */
    history: z
      .array(
        z.object({
          role: z.string().max(16),
          content: z.string(),
        }),
      )
      .optional(),
    /** What this run may recall and retain. Supplied by a conversation. */
    memory: z
      .object({
        conversation: z.boolean(),
        user: z.boolean(),
        agent: z.boolean(),
      })
      .optional(),
  })
  .strict();
export type CreateRunRequest = z.infer<typeof createRunSchema>;

/**
 * What a trace event describes.
 *
 * Coarser than the event type, so a timeline can be grouped or filtered without
 * knowing every individual type. Adding a capability adds types within an
 * existing category far more often than it adds a category.
 */
export const eventCategorySchema = z.enum([
  "run",
  "model",
  "tool",
  "output",
  "memory",
  "knowledge",
  "reasoning",
  "approval",
  "subagent",
  "workflow",
  "task",
  "session",
  "context",
  "skill",
]);
export type EventCategory = z.infer<typeof eventCategorySchema>;

/**
 * Public event types.
 *
 * A stable surface mapped from the framework's much larger internal vocabulary,
 * so the internals can change without breaking customers. Unmapped internal
 * events are dropped rather than forwarded.
 */
export const runEventTypeSchema = z.enum([
  "run.started",
  "run.completed",
  "run.failed",
  "run.cancelled",
  "run.paused",
  "run.continued",
  "run.output",
  "run.model.started",
  "run.model.completed",
  "run.tool.started",
  "run.tool.completed",
  "run.tool.failed",
  "run.knowledge.started",
  "run.knowledge.completed",
  "run.memory.recall.started",
  "run.memory.recall.completed",
  "run.memory.update.started",
  "run.memory.update.completed",
  "run.reasoning.started",
  "run.reasoning.completed",
  "run.subagent.spawned",
  "run.subagent.completed",
  "run.subagent.failed",
  "run.subagent.killed",
  "run.workflow.step.started",
  "run.workflow.step.completed",
  "run.workflow.step.failed",
  "run.workflow.step.skipped",
  "run.task.created",
  "run.task.status",
  "run.session.summarised",
  "run.context.compressed",
  /** Emitted by Nixet: the runtime cannot name a skill once it is merged. */
  "run.skill.loaded",
]);
export type RunEventType = z.infer<typeof runEventTypeSchema>;

/** Where a tool came from: `agent`, or `skill:<name>` if a skill supplied it. */
export const TOOL_SOURCE_AGENT = "agent";
export const skillToolSource = (name: string): string => `skill:${name}`;

/** Token counts for one span, where the provider reports them. */
export const eventTokensSchema = z.object({
  input: z.number().int().nonnegative().optional(),
  output: z.number().int().nonnegative().optional(),
  cache_read: z.number().int().nonnegative().optional(),
  reasoning: z.number().int().nonnegative().optional(),
});

export const runEventSchema = z.object({
  sequence: z
    .number()
    .int()
    .nonnegative()
    .describe("Monotonic within a run, so a dropped stream can resume."),
  type: runEventTypeSchema.describe("Event type."),
  category: eventCategorySchema.describe("What this event describes."),
  run_id: z.string().describe("Run this event belongs to."),
  data: z
    .string()
    .nullable()
    .describe("Short label: a text delta, a tool name, or a failure reason."),
  /**
   * Fields specific to this event type. Shapes differ by category, so this is
   * an object rather than columns: a knowledge event reports documents found,
   * a tool event reports arguments and a result.
   */
  payload: z.record(z.string(), z.unknown()).nullable(),
  duration_ms: z.number().int().nonnegative().nullable(),
  tokens: eventTokensSchema.nullable(),
  /** Computed from tokens; null when the model has no published rate. */
  cost_usd: z.number().nullable(),
  /**
   * The event that produced this one. A sub-agent's events point at the event
   * that spawned it, so a trace is a tree rather than a flat list.
   */
  parent_event_id: z.string().nullable(),
  created_at: z.string().describe("RFC 3339 timestamp."),
});
export type RunEvent = z.infer<typeof runEventSchema>;
