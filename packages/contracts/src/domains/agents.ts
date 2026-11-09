import { z } from "zod";
import { REDACTION_OFF, redactionPolicySchema } from "./redaction.js";
import { toolPoliciesSchema } from "./tools.js";
import { GUARDRAILS_OFF, guardrailBindingSchema } from "./guardrails.js";

/**
 * Agents and their versions.
 *
 * An agent is a stable identity. A version is an immutable snapshot of the
 * configuration used to build it: instructions, model, tools. A run pins one
 * version, so a run can always be reproduced from what it recorded.
 */

export const MAX_AGENT_NAME = 80;
export const MAX_INSTRUCTIONS = 20_000;

export const agentSchema = z.object({
  id: z.string().describe("Unique identifier, prefixed `agt_`."),
  name: z.string().describe("Human-readable name."),
  description: z.string().nullable().describe("Optional summary of what the agent does."),
  current_version: z
    .string()
    .nullable()
    .describe("Version used when a run does not name one. Null until the first publish."),
  created_at: z.string().describe("RFC 3339 creation timestamp."),
  updated_at: z.string().describe("RFC 3339 timestamp of the last change."),
});
export type Agent = z.infer<typeof agentSchema>;

/** Ownership is never accepted from a body: scope comes from the API key. */
export const createAgentSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_AGENT_NAME).describe("Human-readable name."),
    description: z
      .string()
      .trim()
      .max(500)
      .optional()
      .describe("Optional summary of what the agent does."),
  })
  .strict();
export type CreateAgentRequest = z.infer<typeof createAgentSchema>;

/**
 * Model selection.
 *
 * `nix` is the managed default and needs no customer credential. The other
 * providers use a key the customer supplies. The model behind `nix` is
 * deliberately not part of the contract.
 */
export const providerSchema = z.enum(["nix", "openai", "anthropic"]);
export type Provider = z.infer<typeof providerSchema>;

/**
 * Capability tier for the managed `nix` provider.
 *
 * A tier states intent rather than naming a model, so the backing model can
 * change without breaking callers and without disclosing which model serves a
 * request. Callers who need an exact model bring their own provider key.
 */
export const tierSchema = z.enum(["fast", "balanced", "powerful"]);
export type Tier = z.infer<typeof tierSchema>;

export const modelSchema = z
  .object({
    provider: providerSchema
      .default("nix")
      .describe("`nix` is managed and needs no key of your own."),
    model: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .describe(
        "Model identifier. Required for `openai` and `anthropic`; rejected for `nix`, which selects by tier.",
      ),
    tier: tierSchema
      .optional()
      .describe(
        "Capability tier for `nix`, defaulting to `balanced`. Rejected for other providers.",
      ),
    temperature: z.number().min(0).max(2).optional().describe("Sampling temperature."),
    max_tokens: z
      .number()
      .int()
      .min(1)
      .max(200_000)
      .optional()
      .describe("Upper bound on generated tokens."),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.provider === "nix" && value.model) {
      // Accepting a model id here would publish a third party's model names as
      // part of this contract and undo the non-disclosure the tier provides.
      ctx.addIssue({
        code: "custom",
        path: ["model"],
        message: "The nix provider selects a model by tier. Use `tier` instead.",
      });
    }
    if (value.provider !== "nix") {
      if (!value.model) {
        ctx.addIssue({
          code: "custom",
          path: ["model"],
          message: `A model is required for the ${value.provider} provider.`,
        });
      }
      if (value.tier) {
        ctx.addIssue({
          code: "custom",
          path: ["tier"],
          message: "Tiers apply only to the nix provider. Name a model instead.",
        });
      }
    }
  });
export type ModelConfig = z.infer<typeof modelSchema>;

/** A tool the runtime resolves by name from its registry. */
export const toolRefSchema = z.object({ name: z.string().max(80) }).strict();

/** Skills an agent version uses, stored already resolved to a version. */
export const agentSkillSchema = z.object({
  name: z.string(),
  version: z.string(),
  digest: z.string(),
});

/**
 * A placeholder an agent's instructions may contain.
 *
 * Lowercase, because `{{Data_Context}}` and `{{data_context}}` being different
 * slots is a bug waiting to be filed.
 */
export const variableNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "A variable name starts with a letter and holds lowercase letters, numbers and underscores.",
  );

/** The most a run may substitute into one placeholder. */
export const MAX_VARIABLE_VALUE = 10_000;

/**
 * Finds `{{name}}` in instructions.
 *
 * Deliberately strict: no spaces inside the braces, no nesting, no
 * expressions. A template language here would be a second thing to learn and a
 * second thing to get wrong, and the requirement is substitution.
 */
export const VARIABLE_PATTERN = /\{\{([a-z][a-z0-9_]*)\}\}/g;

/** Every placeholder an instruction string names, in order, without repeats. */
export function variablesIn(instructions: string): string[] {
  const found = new Set<string>();
  for (const match of instructions.matchAll(VARIABLE_PATTERN)) found.add(match[1]);
  return [...found];
}

/**
 * Substitute a run's values into a version's instructions.
 *
 * Values are inserted literally and never re-scanned, so a value that itself
 * contains `{{other}}` cannot pull in a second variable. That matters because
 * values come from a customer's backend at run time while the template was
 * fixed at publish: re-scanning would let a value reach a placeholder the
 * version never declared.
 */
export function applyVariables(
  instructions: string,
  values: Record<string, string>,
): string {
  return instructions.replace(VARIABLE_PATTERN, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : whole,
  );
}

export const agentVersionSchema = z.object({
  id: z.string(),
  agent_id: z.string(),
  /** Monotonic within an agent: v1, v2, v3. */
  version: z.string(),
  instructions: z.string(),
  model: modelSchema,
  tools: z.array(toolRefSchema),
  skills: z.array(agentSkillSchema).describe("Resolved at publish, not at run."),
  redaction: redactionPolicySchema.describe("Masking applied to run input and output."),
  mcp_servers: z
    .array(z.string())
    .describe("MCP servers this version may use, pinned by name at publish."),
  tool_policies: toolPoliciesSchema.describe(
    "Per-tool overrides as `server.tool`. Anything unnamed takes its tag's default.",
  ),
  knowledge_collections: z
    .array(z.string())
    .describe("Knowledge collections this version may search, pinned by name at publish."),
  variables: z
    .array(z.string())
    .describe("Placeholders in `instructions` that a run must supply."),
  guardrails: guardrailBindingSchema.describe(
    "Guardrails this version runs, pinned by name at publish.",
  ),
  /** Content hash of the frozen configuration, recorded on every run. */
  digest: z.string(),
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof agentVersionSchema>;

export const createAgentVersionSchema = z
  .object({
    instructions: z
      .string()
      .trim()
      .min(1)
      .max(MAX_INSTRUCTIONS)
      .describe("System prompt that defines the agent's behaviour."),
    model: modelSchema.default({ provider: "nix" }).describe("Model configuration."),
    tools: z
      .array(toolRefSchema)
      .max(32)
      .default([])
      .describe(
        "Tools the agent may call, by name. Unknown names are rejected at publish rather " +
          "than failing a run. Nixet provides `current_time`, `calculate`, `web_search` and " +
          "`fetch_url`; your own tools reach an agent through an MCP server instead. " +
          "`fetch_url` reads a page the model chose, so the address is resolved and checked " +
          "first — a private, loopback or cloud-metadata address is refused.",
      ),
    skills: z
      .array(z.string())
      .max(16)
      .default([])
      .describe("Skills to use, as `name` or `name@v2`."),
    redaction: redactionPolicySchema
      .default(REDACTION_OFF)
      .describe(
        "Mask personal data in run input and output before dispatch. Traces are not redacted.",
      ),
    mcp_servers: z
      .array(z.string().min(1).max(64))
      .max(10)
      .default([])
      .describe(
        "Names of registered MCP servers. Cannot be combined with redaction: a masked " +
          "run would hand tools placeholders instead of values.",
      ),
    tool_policies: toolPoliciesSchema
      .default({})
      .describe(
        "Per-tool overrides as `server.tool`, each `allow`, `ask` or `deny`. Only the " +
          "exceptions: anything unnamed takes its tag's default, so a server adding a " +
          "tool does not require republishing. `ask` is refused until approvals exist.",
      ),
    knowledge_collections: z
      .array(z.string().min(1).max(64))
      .max(10)
      .default([])
      .describe(
        "Names of knowledge collections this version may search. A collection with no " +
          "ready sources is not an error: it returns nothing until one finishes.",
      ),
    variables: z
      .array(variableNameSchema)
      .max(16)
      .default([])
      .describe(
        "Placeholders in `instructions`, as `{{name}}`, that a run supplies. Declared here " +
          "so a run can only fill slots this version named: a run that could inject arbitrary " +
          "prompt text would make the caller's own backend a prompt-injection surface, and the " +
          "version would no longer describe how the agent behaves.",
      ),
    guardrails: guardrailBindingSchema
      .default(GUARDRAILS_OFF)
      .describe(
        "Named guardrails to run, per stage. Order is the order given: under `run_all` each " +
          "guard sees the text the previous one produced, so which runs first is part of the " +
          "configuration rather than incidental.",
      ),
    publish: z
      .boolean()
      .default(true)
      .describe("Make this the version new runs use by default."),
  })
  .strict();
export type CreateAgentVersionRequest = z.infer<typeof createAgentVersionSchema>;
