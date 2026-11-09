import { z } from "zod";
import { mcpConnectionSchemeSchema } from "./mcp.js";

/**
 * An end user's credential for one MCP server.
 *
 * The catalog and the connection are deliberately separate. A server is
 * registered once — `https://broker.example.com/mcp` is the same URL for every user, and
 * only the token differs — and a connection binds one user to one credential
 * for it. That split is what keeps an agent version about behaviour: the
 * version names which servers it may reach, and a connection decides whose
 * account it reaches them as.
 *
 * A stored value is write-only. Nothing here returns it over HTTP; it is
 * decrypted only when a run is dispatched, into a header the runtime receives.
 */

export const MAX_CONNECTION_VALUE = 8_192;

/**
 * Whether a connection can currently authenticate a run.
 *
 * `pending` exists because an OAuth connection is created before the user has
 * consented: the row is the thing the callback completes. A run naming a
 * pending or expired connection fails rather than calling the server without
 * a credential — the server would answer as an anonymous caller, and for a
 * broker that is a worse outcome than a refused run.
 */
export const connectionStatusSchema = z.enum([
  "pending",
  "active",
  "expired",
  "revoked",
]);
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

export const connectionSchema = z.object({
  id: z.string().describe("Unique identifier, prefixed `con_`."),
  user_id: z.string().describe("The end user this credential belongs to."),
  server: z.string().describe("Name of the registered MCP server."),
  scheme: mcpConnectionSchemeSchema,
  status: connectionStatusSchema,
  /**
   * When the credential stops working, where the provider said so.
   *
   * Null for a scheme that does not expire, and for a provider that returned
   * no expiry. A null expiry is not a promise that the credential is valid: it
   * means nobody told us otherwise, and a rejected call is what reveals it.
   */
  expires_at: z.string().nullable(),
  /** Set when a run last authenticated with it. Null until one does. */
  last_used_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Connection = z.infer<typeof connectionSchema>;

/**
 * Supply a credential directly.
 *
 * For `api_key`, where the user already holds the value and there is nothing
 * to redirect them through. Also the path a platform uses to push a token it
 * obtained itself, which is how refresh works until Nixet performs it.
 */
export const createConnectionSchema = z
  .object({
    user_id: z.string().min(1).max(64).describe("End user to bind this credential to."),
    server: z
      .string()
      .min(1)
      .max(64)
      .describe("Registered MCP server. Its auth must be `per_user`."),
    value: z
      .string()
      .min(1)
      .max(MAX_CONNECTION_VALUE)
      .describe("The credential. Stored encrypted and never returned."),
    /**
     * Optional, and trusted when given.
     *
     * A platform pushing an OAuth token knows when it expires; Nixet cannot
     * infer it from an opaque string. Omitted means no known expiry, which the
     * dispatch check treats as usable until the server says otherwise.
     */
    expires_at: z
      .string()
      .datetime()
      .optional()
      .describe("When the credential stops working, if known."),
    refresh_value: z
      .string()
      .min(1)
      .max(MAX_CONNECTION_VALUE)
      .optional()
      .describe("Refresh token, where the provider issued one."),
  })
  .strict();
export type CreateConnectionRequest = z.infer<typeof createConnectionSchema>;

/**
 * Begin a scheme that cannot be completed in one request.
 *
 * `oauth2` needs the user at the provider's consent screen, and `session`
 * needs them at a sign-in page whose URL the server itself returns. Both answer
 * with somewhere to send the user, and both leave a `pending` connection that
 * the callback completes.
 */
export const authorizeConnectionSchema = z
  .object({
    user_id: z.string().min(1).max(64),
    server: z.string().min(1).max(64),
    /**
     * Where to send the user once the provider is done.
     *
     * Required, and checked against the workspace's registered origins: an
     * open redirect here would hand an authorization code to whoever asked.
     */
    return_url: z.string().url().max(500),
  })
  .strict();
export type AuthorizeConnectionRequest = z.infer<typeof authorizeConnectionSchema>;

export const authorizationSchema = z.object({
  connection_id: z.string(),
  /** Send the user here. Single use, and short lived. */
  redirect_url: z.string(),
  expires_at: z.string(),
});
export type Authorization = z.infer<typeof authorizationSchema>;

/** Filters for listing a user's connections. */
export const findConnectionsSchema = z
  .object({
    user_id: z.string().min(1).max(64).optional(),
    server: z.string().min(1).max(64).optional(),
    status: connectionStatusSchema.optional(),
    $limit: z.coerce.number().int().min(1).max(100).optional(),
    $offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();
export type FindConnectionsRequest = z.infer<typeof findConnectionsSchema>;
