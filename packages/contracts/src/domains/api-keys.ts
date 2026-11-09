import { z } from "zod";
import { environmentSchema, scopeSchema, permissionSchema, type Environment } from "../primitives.js";

export const apiKeyStatusSchema = z.enum(["active", "revoked", "expired"]);
export type ApiKeyStatus = z.infer<typeof apiKeyStatusSchema>;

/** Key metadata. Safe to list, cache and render. Carries no secret material. */
export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  status: apiKeyStatusSchema,
  permissions: z.array(permissionSchema),
  scope: scopeSchema,
  created_at: z.string(),
  expires_at: z.string(),
  last_used_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

export const MAX_KEY_NAME_LENGTH = 80;
export const MIN_EXPIRY_DAYS = 1;
export const MAX_EXPIRY_DAYS = 365;
export const DEFAULT_EXPIRY_DAYS = 90;

/**
 * Creation request. Ownership is never accepted from the body: scope comes from
 * verified session context and scope headers, so `strict()` rejects any attempt
 * to smuggle `organization_id` or a status field through creation.
 */
export const createApiKeySchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_KEY_NAME_LENGTH),
    // Derived, not a literal: a hardcoded cap silently rejects every key once
    // a new permission is added.
    permissions: z
      .array(permissionSchema)
      .min(1)
      .max(permissionSchema.options.length),
    expires_in_days: z
      .number()
      .int()
      .min(MIN_EXPIRY_DAYS)
      .max(MAX_EXPIRY_DAYS)
      .default(DEFAULT_EXPIRY_DAYS),
  })
  .strict();
export type CreateApiKeyRequest = z.infer<typeof createApiKeySchema>;

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/**
 * List query, paginated with `$limit` and `$offset`.
 */
export const listApiKeysQuerySchema = z
  .object({
    $limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    $offset: z.number().int().min(0).default(0),
    status: apiKeyStatusSchema.optional(),
  })
  .strict();
export type ListApiKeysQuery = z.infer<typeof listApiKeysQuerySchema>;

/**
 * List envelope. Matches the framework response shape `{ message, data, count }`,
 * where `count` is the total number of scoped rows.
 */
export const apiKeyListResponseSchema = z.object({
  message: z.string(),
  data: z.array(apiKeySchema),
  count: z.number().int().nonnegative(),
});
export type ApiKeyListResponse = z.infer<typeof apiKeyListResponseSchema>;

export const apiKeyResponseSchema = z.object({
  message: z.string(),
  data: apiKeySchema,
});

/**
 * Creation response. `secret` is present exactly once, on the original 201.
 * A replayed idempotent request returns `replayed: true` with no secret,
 * because the plaintext is unrecoverable by design.
 */
export const createApiKeyResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    key: apiKeySchema,
    secret: z.string().optional(),
    replayed: z.boolean(),
  }),
});
export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>;

export const KEY_PREFIX = "nxt";
/** `nxt_<env>_<random>` — the prefix is stored, the random tail never is. */
export const keyPrefixFor = (environment: Environment): string =>
  `${KEY_PREFIX}_${environment === "production" ? "live" : "dev"}`;
