import { z } from "zod";

/**
 * Secrets.
 *
 * A credential a customer gives us so an agent can reach something of theirs —
 * an MCP server's bearer token, later an HTTP tool's API key.
 *
 * The value is written once and never returned. Everything that uses a secret
 * refers to it by name, so a configuration can be read, copied and versioned
 * without the credential travelling with it.
 */

export const MAX_SECRET_VALUE = 8_000;

/**
 * Lowercase, hyphenated, stable.
 *
 * A version pins a secret by name, so renaming one would silently change what
 * a published agent reaches for.
 */
export const secretNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and hyphens, e.g. `github-token`.",
  );

/**
 * What a read returns.
 *
 * Never the value. A secret that could be read back is a secret store that
 * leaks the moment any read path is wrong, so the API has no way to ask.
 */
export const secretSchema = z.object({
  id: z.string().describe("Unique identifier, prefixed `sec_`."),
  name: secretNameSchema,
  description: z.string().nullable(),
  /** First few characters, so a reader can tell two secrets apart. */
  hint: z.string().describe("A short, non-reversible excerpt. Never the value."),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Secret = z.infer<typeof secretSchema>;

export const createSecretSchema = z
  .object({
    name: secretNameSchema,
    value: z.string().min(1).max(MAX_SECRET_VALUE),
    description: z.string().trim().max(200).optional(),
  })
  .strict();
export type CreateSecretRequest = z.infer<typeof createSecretSchema>;

/** Replacing a value. The name cannot change, because versions pin it. */
export const updateSecretSchema = z
  .object({
    value: z.string().min(1).max(MAX_SECRET_VALUE).optional(),
    description: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine((body) => body.value !== undefined || body.description !== undefined, {
    message: "Nothing to update.",
  });
export type UpdateSecretRequest = z.infer<typeof updateSecretSchema>;

/**
 * How a configuration refers to a secret.
 *
 * `{{ secret.github-token }}` inside a header value. The reference is what gets
 * stored and versioned; the value is resolved at execution and never persisted
 * alongside the thing that used it.
 */
export const SECRET_REFERENCE = /\{\{\s*secret\.([a-z0-9-]+)\s*\}\}/g;

/** Every secret a string refers to, in the order they appear. */
export function secretsReferencedBy(value: string): string[] {
  return [...value.matchAll(SECRET_REFERENCE)].map((match) => match[1]);
}
