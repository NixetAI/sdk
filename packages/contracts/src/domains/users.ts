import { z } from "zod";

/**
 * Users.
 *
 * The people a customer's agent serves, not the people who log into the Nixet
 * console — those are members. A user belongs to one workspace and environment,
 * so two customers can use the same reference for different people.
 */

export const MAX_USER_REFERENCE = 128;

/**
 * The customer's own identifier for this person.
 *
 * Opaque to Nixet and unique within a scope. Customers should keep personal
 * data out of it; `email` and `name` exist for that, and can be erased without
 * breaking the reference their systems rely on.
 */
export const userReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_USER_REFERENCE);

export const userSchema = z.object({
  id: z.string().describe("Unique identifier, prefixed `usr_`."),
  reference: userReferenceSchema.describe("Your identifier for this person."),
  email: z.string().nullable(),
  name: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).describe("Your own fields."),
  created_at: z.string(),
  updated_at: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const createUserSchema = z
  .object({
    reference: userReferenceSchema,
    email: z.string().trim().email().max(320).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateUserRequest = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    email: z.string().trim().email().max(320).nullable().optional(),
    name: z.string().trim().min(1).max(200).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type UpdateUserRequest = z.infer<typeof updateUserSchema>;
