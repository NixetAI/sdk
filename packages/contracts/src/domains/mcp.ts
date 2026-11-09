import { z } from "zod";

/**
 * MCP servers.
 *
 * A customer registers a server they run, and an agent version names it. The
 * runtime connects, discovers its tools, and the agent can call them.
 *
 * Remote only. `stdio` would mean spawning a process inside our runtime from
 * customer-supplied arguments, which is arbitrary code execution as us, so the
 * transport is not in the enum rather than being rejected later.
 */

export const mcpTransportSchema = z.enum(["http", "sse"]);
export type McpTransport = z.infer<typeof mcpTransportSchema>;

/**
 * How an end user's credential for a server was obtained.
 *
 * The scheme decides what connecting costs the user, and what expiry means:
 *
 * - `api_key`  the value is supplied directly and does not expire.
 * - `oauth2`   the user is sent through the provider's consent screen. The
 *              access token expires; a refresh token, where the provider
 *              issues one, is stored so it can be replaced without asking
 *              the user again.
 * - `session`  the credential is a session identifier obtained by calling a
 *              tool on the server, and there is nothing to refresh it with.
 *              Expiry means sending the user through sign-in again, which is
 *              why it is not modelled as a short-lived `oauth2`.
 */
export const mcpConnectionSchemeSchema = z.enum(["api_key", "oauth2", "session"]);
export type McpConnectionScheme = z.infer<typeof mcpConnectionSchemeSchema>;

/**
 * How Nixet proves who it is to the server.
 *
 * `none` is for a server that is open or already restricted by network. The
 * rest reference a stored secret by name rather than carrying a credential, so
 * a configuration can be read, copied and versioned without the token.
 */
export const mcpAuthSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }).strict(),

  z
    .object({
      type: z.literal("bearer"),
      /** Name of a stored secret. Sent as `Authorization: Bearer …`. */
      secret: z.string().min(1).max(64),
    })
    .strict(),

  z
    .object({
      type: z.literal("header"),
      /** For servers wanting their own header, e.g. `X-API-Key`. */
      header: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[A-Za-z0-9-]+$/, "A header name may contain letters, numbers and hyphens."),
      secret: z.string().min(1).max(64),
    })
    .strict(),

  z
    .object({
      type: z.literal("oauth"),
      /**
       * An OAuth access token the customer obtained and stored as a secret.
       *
       * Nixet does not run the authorization flow: that would mean holding a
       * client secret and a refresh token per server, which is a larger piece
       * of work than connecting to one. A token that expires stops working and
       * the customer replaces it.
       */
      secret: z.string().min(1).max(64),
    })
    .strict(),

  z
    .object({
      type: z.literal("per_user"),
      /**
       * The credential belongs to the end user, not to the workspace.
       *
       * Every other variant names one stored secret, which makes a server
       * registration reachable as exactly one identity. That is right for an
       * integration the operator owns — their GitHub, their internal API — and
       * wrong for a product where each end user links their own account. There
       * the URL is identical for everyone and only the token differs, so a
       * registration per user would force an agent version per user, and
       * version history would stop describing behaviour and become a
       * credential registry.
       *
       * So this variant names no secret. The server is registered once, and
       * the credential is resolved per run from the user the run names.
       */
      scheme: mcpConnectionSchemeSchema,
    })
    .strict(),
]);
export type McpAuth = z.infer<typeof mcpAuthSchema>;

/**
 * Whether a server's credential comes from the end user rather than the
 * workspace. A per-user server cannot be reached by a run that names no user.
 */
export function isPerUserAuth(auth: McpAuth): boolean {
  return auth.type === "per_user";
}

/**
 * A URL Nixet will connect to.
 *
 * Only the shape is checked here. Whether the host is reachable, and whether it
 * is somewhere we are willing to go, is decided at connect time against the
 * resolved address — a name that passes here can still resolve to a private
 * one, and the check that matters has to happen after resolution.
 */
export const mcpUrlSchema = z
  .string()
  .url()
  .max(500)
  .refine((value) => value.startsWith("https://") || value.startsWith("http://"), {
    message: "Only http and https URLs are supported.",
  });

/**
 * Tools are their own resource.
 *
 * A server can expose a hundred, each carrying its own tags and its own policy,
 * so they are rows rather than a field on this one. See `domains/tools`.
 */

export const mcpServerSchema = z.object({
  id: z.string().describe("Unique identifier, prefixed `mcp_`."),
  name: z
    .string()
    .describe("Stable handle a version pins, e.g. `github`. Lowercase and hyphenated."),
  description: z.string().nullable(),
  transport: mcpTransportSchema,
  url: z.string(),
  auth: mcpAuthSchema,
  /**
   * How many tools this server offered when it was last reached.
   *
   * The tools themselves are listed separately, because a server can have more
   * of them than belongs in a response about the server.
   */
  tool_count: z.number(),
  tools_refreshed_at: z.string().nullable(),
  /** Why the last connection failed, when it did. */
  last_error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type McpServer = z.infer<typeof mcpServerSchema>;

export const mcpNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and hyphens, e.g. `github`.",
  );

export const createMcpServerSchema = z
  .object({
    name: mcpNameSchema,
    url: mcpUrlSchema,
    transport: mcpTransportSchema.default("http"),
    description: z.string().trim().max(200).optional(),
    auth: mcpAuthSchema.default({ type: "none" }),
  })
  .strict();
export type CreateMcpServerRequest = z.infer<typeof createMcpServerSchema>;

export const updateMcpServerSchema = z
  .object({
    url: mcpUrlSchema.optional(),
    transport: mcpTransportSchema.optional(),
    description: z.string().trim().max(200).optional(),
    auth: mcpAuthSchema.optional(),
  })
  .strict();
export type UpdateMcpServerRequest = z.infer<typeof updateMcpServerSchema>;

/**
 * The workspace secret a server's auth refers to, if any.
 *
 * Null for `none`, and null for `per_user`: that credential is the end user's
 * and is not in the workspace secret store at all, so there is no name to
 * return. Callers resolving a per-user server read `mcp.connections` instead.
 */
export function secretForAuth(auth: McpAuth): string | null {
  if (auth.type === "none" || auth.type === "per_user") return null;
  return auth.secret;
}
