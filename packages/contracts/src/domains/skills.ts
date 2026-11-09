import { z } from "zod";
import { toolRefSchema } from "./agents.js";

/**
 * Skills.
 *
 * A skill is reusable expertise: instructions plus the tools that expertise
 * needs, packaged under a name and versioned like an agent. An agent version
 * references skills by `name@version`, so what an agent knew at run time can
 * always be reconstructed.
 */

export const MAX_SKILL_NAME = 80;
export const MAX_SKILL_INSTRUCTIONS = 20_000;

/**
 * Names may be namespaced with a single slash, as in `research/company-lookup`,
 * which groups related skills without a directory to maintain.
 */
export const skillNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_SKILL_NAME)
  .regex(
    /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)?$/,
    "Use lowercase letters, numbers and hyphens, optionally namespaced as `group/name`.",
  );

export const skillSchema = z.object({
  id: z.string().describe("Unique identifier, prefixed `skl_`."),
  name: skillNameSchema.describe("Unique within a workspace and environment."),
  description: z.string().nullable(),
  current_version: z
    .string()
    .nullable()
    .describe("Version used when a reference names no version."),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Skill = z.infer<typeof skillSchema>;

export const createSkillSchema = z
  .object({
    name: skillNameSchema,
    description: z.string().trim().max(500).optional(),
    /** Supplying instructions also publishes the first version. */
    instructions: z.string().trim().min(1).max(MAX_SKILL_INSTRUCTIONS).optional(),
    tools: z.array(toolRefSchema).max(32).optional(),
  })
  .strict();
export type CreateSkillRequest = z.infer<typeof createSkillSchema>;

export const skillVersionSchema = z.object({
  id: z.string(),
  skill_id: z.string(),
  version: z.string().describe("Monotonic within a skill: v1, v2, v3."),
  instructions: z
    .string()
    .describe("Added to the agent's prompt when the skill is in use."),
  tools: z.array(toolRefSchema).describe("Tools this expertise requires."),
  digest: z.string().describe("Content hash of the frozen skill."),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof skillVersionSchema>;

export const createSkillVersionSchema = z
  .object({
    instructions: z.string().trim().min(1).max(MAX_SKILL_INSTRUCTIONS),
    tools: z.array(toolRefSchema).max(32).default([]),
    publish: z.boolean().default(true),
  })
  .strict();
export type CreateSkillVersionRequest = z.infer<typeof createSkillVersionSchema>;

/**
 * How an agent version names a skill.
 *
 * `name@v2` pins a version. A bare `name` resolves to the published version
 * when the agent version is created, and the resolved value is what gets
 * stored: resolving at run time would make a past run unreproducible.
 */
export const skillRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_SKILL_NAME + 12)
  .regex(
    /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)?(@v\d+)?$/,
    "Reference a skill as `name` or `name@v2`.",
  );
export type SkillRef = z.infer<typeof skillRefSchema>;

/** A skill as stored on an agent version, already resolved to one version. */
export const resolvedSkillSchema = z.object({
  name: z.string(),
  version: z.string(),
  digest: z.string(),
});
export type ResolvedSkill = z.infer<typeof resolvedSkillSchema>;
