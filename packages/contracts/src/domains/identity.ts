import { z } from "zod";

export const roleSchema = z.enum([
  "owner",
  "admin",
  "developer",
  "operator",
  "viewer",
]);
export type Role = z.infer<typeof roleSchema>;

export const membershipSchema = z.object({
  organization_id: z.string(),
  project_id: z.string(),
  role: roleSchema,
});

/** Verified console identity. Never carries a credential. */
export const sessionSchema = z.object({
  subject: z.string(),
  email: z.string().nullable(),
  memberships: z.array(membershipSchema),
});
export type Session = z.infer<typeof sessionSchema>;

export const sessionResponseSchema = z.object({
  message: z.string(),
  data: sessionSchema,
});
