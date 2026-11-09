import { z } from "zod";

/**
 * Shared wire primitives.
 *
 * Wire fields are snake_case and timestamps are RFC 3339 UTC strings. Nothing
 * in the contract may describe a recoverable secret: a plaintext key appears
 * only in the single creation response, never in a list or get payload.
 */

export const API_VERSION = "v1" as const;

/** Scope headers. A dashboard selects scope; a scoped key derives it. */
export const SCOPE_HEADERS = {
  organization: "Nixet-Organization",
  project: "Nixet-Project",
  environment: "Nixet-Environment",
} as const;

export const IDEMPOTENCY_HEADER = "Idempotency-Key";
export const REQUEST_ID_HEADER = "X-Request-Id";

export const environmentSchema = z.enum(["development", "production"]);
export type Environment = z.infer<typeof environmentSchema>;

export const scopeSchema = z.object({
  organization_id: z.string().min(1).max(64),
  project_id: z.string().min(1).max(64),
  environment_id: environmentSchema,
});
export type Scope = z.infer<typeof scopeSchema>;

/**
 * Permissions an issued key may carry. `api_keys:write` is deliberately absent:
 * a customer key must never be able to mint further credentials.
 *
 * `billing:write` is absent for a different reason: there is no such operation.
 * A plan change moves money, so it happens through Stripe and arrives as a
 * webhook. An API that could set a plan would be an API that could grant a
 * customer Scale's allowance without charging for it.
 */
export const permissionSchema = z.enum([
  "api_keys:read",
  "agents:read",
  "agents:write",
  "runs:read",
  "runs:write",
  "users:read",
  "users:write",
  "conversations:read",
  "conversations:write",
  "memory:read",
  "memory:write",
  "secrets:read",
  "secrets:write",
  "mcp:read",
  "mcp:write",
  "connections:read",
  "connections:write",
  "knowledge:read",
  "knowledge:write",
  "billing:read",
]);
export type Permission = z.infer<typeof permissionSchema>;

export const PERMISSION_PRESETS = {
  read: [
    "api_keys:read",
    "agents:read",
    "runs:read",
    "users:read",
    "conversations:read",
    "memory:read",
    // Reading a secret never returns its value, so this is genuinely a read.
    "secrets:read",
    "mcp:read",
    // A connection read returns status and expiry, never the credential.
    "connections:read",
    // Reading a collection returns counts and the chunking rule, never a line
    // of a document, so this is a read in the same sense the rest are.
    "knowledge:read",
    // Usage is not a credential, and hiding spend from the person causing it is
    // how surprise invoices happen. There is no write to pair this with.
    "billing:read",
  ],
  standard: [
    "api_keys:read",
    "agents:read",
    "agents:write",
    "runs:read",
    "runs:write",
    "users:read",
    "users:write",
    "conversations:read",
    "conversations:write",
    "memory:read",
    "memory:write",
    "secrets:read",
    "secrets:write",
    "mcp:read",
    "mcp:write",
    "connections:read",
    "connections:write",
    "knowledge:read",
    "knowledge:write",
    // No `billing:write` to go beside it: a plan change is a Stripe webhook.
    "billing:read",
  ],
} as const satisfies Record<string, readonly Permission[]>;

export type PermissionPreset = keyof typeof PERMISSION_PRESETS;

export const ERROR_CODES = [
  "BAD_REQUEST",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "INVALID_CURSOR",
  "SCOPE_MISMATCH",
  "RATE_LIMITED",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Framework error envelope: a status code plus `{ message }`. */
export const errorResponseSchema = z.object({
  message: z.string(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

