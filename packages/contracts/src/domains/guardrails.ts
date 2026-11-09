import { z } from "zod";

/**
 * Guardrails: inspecting and rewriting what an agent is given and what it says.
 *
 * A guard belongs to the workspace, not to a version. A rule like "never name
 * a specific fund" applies to every agent a customer will ever run, and
 * defining it per version would mean maintaining it in as many places as there
 * are versions. A version names the guards it uses, the same way it names MCP
 * servers and knowledge collections, and pins them by name at publish.
 *
 * Declarative rather than code. A guard runs on every turn, and an output
 * guard runs inside the stream, so a network hop per guard would be paid in
 * first-token latency — four guards on one turn would be felt. Patterns and
 * the built-in detectors cover the common rules; anything needing real logic
 * is a separate question with a different cost, and is deliberately not
 * pretended to here.
 */

/**
 * Where a guard runs.
 *
 * `tool_result` is the one that is easy to leave out and the one that leaves a
 * hole. A tool returning structured data — a component tree, a row set —
 * reaches the caller without passing through the agent's text, so an output
 * guard never sees it. Any agent that renders what a tool returns needs this
 * stage.
 */
export const guardrailStageSchema = z.enum(["input", "output", "tool_result"]);
export type GuardrailStage = z.infer<typeof guardrailStageSchema>;

/**
 * What a guard does when it matches.
 *
 * `modify` is the one that earns its place. "Scrub the fund name and let the
 * rest through" is better product behaviour than refusing the turn, and
 * refusing is what a guard that can only block has to do.
 *
 * `warn` passes the text through unchanged and records that it matched, which
 * is how a rule is introduced before it is enforced.
 */
export const guardrailActionSchema = z.enum(["allow", "modify", "warn", "block"]);
export type GuardrailAction = z.infer<typeof guardrailActionSchema>;

/** What a guard inspects with. */
export const guardrailKindSchema = z.enum(["patterns", "builtin"]);
export type GuardrailKind = z.infer<typeof guardrailKindSchema>;

/**
 * The detectors the runtime already carries.
 *
 * Named rather than described, because each is code in the runtime and a
 * customer choosing one is choosing behaviour that already exists rather than
 * specifying new behaviour.
 */
export const guardrailDetectorSchema = z.enum([
  /** Personal data: names, emails, phone numbers, account identifiers. */
  "pii",
  /** Refuses text about a named subject. Needs `topics`. */
  "topics",
  /** Refuses text longer than `max_characters`. */
  "length",
]);
export type GuardrailDetector = z.infer<typeof guardrailDetectorSchema>;

/**
 * One find-and-replace rule.
 *
 * `replace` is what makes a pattern guard a rewriter rather than only a
 * detector. Omitted, a match means the guard's action fires with nothing
 * substituted, which is what `block` and `warn` want.
 */
export const guardrailPatternSchema = z
  .object({
    match: z
      .string()
      .min(1)
      .max(500)
      .describe("A regular expression, applied case-insensitively."),
    replace: z
      .string()
      .max(200)
      .optional()
      .describe("What to put in its place. Required by `modify`, ignored otherwise."),
  })
  .strict();
export type GuardrailPattern = z.infer<typeof guardrailPatternSchema>;

export const guardrailSchema = z.object({
  id: z.string().describe("Unique identifier, prefixed `grd_`."),
  name: z.string().describe("The handle a version pins."),
  description: z.string().nullable(),
  stage: guardrailStageSchema,
  kind: guardrailKindSchema,
  action: guardrailActionSchema,
  patterns: z.array(guardrailPatternSchema),
  detector: guardrailDetectorSchema.nullable(),
  topics: z.array(z.string()),
  max_characters: z.number().int().positive().nullable(),
  /** Shown to the caller when the guard blocks, and recorded when it matches. */
  message: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Guardrail = z.infer<typeof guardrailSchema>;

export const createGuardrailSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(
        /^[a-z0-9][a-z0-9-]*$/,
        "A guardrail name holds lowercase letters, numbers and hyphens.",
      )
      .describe("How a version refers to this guard."),
    description: z.string().trim().max(200).optional(),
    stage: guardrailStageSchema,
    action: guardrailActionSchema.describe(
      "What happens on a match. `modify` needs a `replace` on every pattern.",
    ),
    patterns: z
      .array(guardrailPatternSchema)
      .max(50)
      .default([])
      .describe("Rules for a `patterns` guard. Omit for a `builtin` one."),
    detector: guardrailDetectorSchema
      .optional()
      .describe("One of the runtime's own detectors. Omit for a `patterns` guard."),
    topics: z
      .array(z.string().trim().min(1).max(80))
      .max(50)
      .default([])
      .describe("Subjects the `topics` detector refuses."),
    max_characters: z
      .number()
      .int()
      .positive()
      .max(1_000_000)
      .optional()
      .describe("Limit for the `length` detector."),
    message: z
      .string()
      .trim()
      .max(500)
      .optional()
      .describe("Shown when this guard blocks. Recorded whenever it matches."),
  })
  .strict()
  .refine((value) => Boolean(value.detector) !== value.patterns.length > 0, {
    message:
      "A guardrail is either patterns or a built-in detector, not both and not neither.",
  })
  .refine(
    (value) =>
      value.action !== "modify" ||
      value.detector !== undefined ||
      value.patterns.every((pattern) => pattern.replace !== undefined),
    {
      message:
        "A `modify` guardrail needs a `replace` on every pattern: there is nothing to rewrite with otherwise.",
    },
  )
  .refine((value) => value.detector !== "topics" || value.topics.length > 0, {
    message: "The `topics` detector needs at least one topic.",
  })
  .refine((value) => value.detector !== "length" || value.max_characters !== undefined, {
    message: "The `length` detector needs `max_characters`.",
  });
export type CreateGuardrailRequest = z.infer<typeof createGuardrailSchema>;
/** What a caller sends: fields with defaults, such as `patterns` and `topics`, may be omitted. */
export type CreateGuardrailParams = z.input<typeof createGuardrailSchema>;

/**
 * How a version runs the guards it names.
 *
 * `fail_fast` stops at the first block, which is what a caller wants when any
 * single refusal ends the turn. `run_all` applies every guard, and each sees
 * the text the previous one produced — so four scrubbing rules compose into
 * one rewritten response instead of the last one winning. Ordering within each
 * stage is the order given here, and is therefore explicit rather than
 * incidental.
 */
export const guardrailModeSchema = z.enum(["fail_fast", "run_all"]);
export type GuardrailMode = z.infer<typeof guardrailModeSchema>;

/**
 * What a blocked run answers with.
 *
 * `return_message` completes the run with the guard's message as the output,
 * which is a turn the caller can show someone. `error` fails the run, which is
 * right when a block means the request should never have been made.
 */
export const guardrailOnBlockSchema = z.enum(["return_message", "error"]);
export type GuardrailOnBlock = z.infer<typeof guardrailOnBlockSchema>;

export const guardrailBindingSchema = z
  .object({
    input: z.array(z.string().min(1).max(64)).max(10).default([]),
    output: z.array(z.string().min(1).max(64)).max(10).default([]),
    tool_result: z.array(z.string().min(1).max(64)).max(10).default([]),
    mode: guardrailModeSchema.default("run_all"),
    on_block: guardrailOnBlockSchema.default("return_message"),
  })
  .strict();
export type GuardrailBinding = z.infer<typeof guardrailBindingSchema>;

export const GUARDRAILS_OFF: GuardrailBinding = {
  input: [],
  output: [],
  tool_result: [],
  mode: "run_all",
  on_block: "return_message",
};

/** Every guard a binding names, across all three stages, without repeats. */
export function guardrailNamesIn(binding: GuardrailBinding): string[] {
  return [
    ...new Set([...binding.input, ...binding.output, ...binding.tool_result]),
  ];
}

/**
 * One guard's verdict on one piece of text.
 *
 * Reported per guard rather than collapsed, so a trace can say which rule
 * rewrote what. A `modify` carries the text it produced, which is also the
 * input to the next guard in `run_all`.
 */
export const guardrailOutcomeSchema = z.object({
  guardrail: z.string(),
  stage: guardrailStageSchema,
  action: guardrailActionSchema,
  message: z.string().nullable(),
  /** How many of its patterns or detections matched. Zero means it allowed. */
  matches: z.number().int().nonnegative(),
});
export type GuardrailOutcome = z.infer<typeof guardrailOutcomeSchema>;
