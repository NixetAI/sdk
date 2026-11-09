import { z } from "zod";

/**
 * Tool access.
 *
 * A server can expose a hundred tools, and a customer rarely wants an agent to
 * have all of them. This is how they say which.
 *
 * Two separate ideas live here, and conflating them is the mistake to avoid:
 *
 *   A **tag** describes what a tool does. It comes from the server's own
 *   annotations where it published any, and from Nixet's reading of the name
 *   and description where it did not. Either way it is a claim, not a
 *   guarantee — the MCP specification is explicit that a server can annotate a
 *   tool `readOnlyHint: true` and delete your files anyway. A tag decides what
 *   a customer is shown and what the default policy is. It enforces nothing.
 *
 *   A **policy** is what Nixet will actually do. It is decided by the customer,
 *   frozen into an agent version, and enforced before a tool is offered to the
 *   model. This is the part that holds.
 */

/**
 * What a tool does, as far as anyone can tell.
 *
 * Deliberately coarser than MCP's four booleans. `readOnlyHint` and
 * `destructiveHint` and `idempotentHint` describe behaviour precisely and
 * answer no question a person actually asks, which is "should this thing be
 * allowed to run on its own".
 */
export const toolTagSchema = z.enum([
  /** Reads. Changes nothing. */
  "read",
  /** Changes something, additively — creating, appending, updating. */
  "write",
  /** Removes or overwrites. The one whose mistakes are not undoable. */
  "destructive",
  /** Reaches something outside the server: the open web, a third party. */
  "external",
]);
export type ToolTag = z.infer<typeof toolTagSchema>;

/** Where a tag came from, because the two deserve different trust. */
export const tagSourceSchema = z.enum([
  /** The server's own MCP annotations. Its claim about itself. */
  "server",
  /** Nixet's reading of the name and description. A guess. */
  "inferred",
]);
export type TagSource = z.infer<typeof tagSourceSchema>;

/**
 * What Nixet does when the agent reaches for a tool.
 *
 * `ask` is declared and not yet enforceable: nothing can pause a run for a
 * human until approvals exist. Until then it refuses, with a reason saying so,
 * rather than quietly behaving as `allow` — a policy that silently does the
 * opposite of what it says is worse than one that does not work.
 */
export const toolPolicySchema = z.enum(["allow", "ask", "deny"]);
export type ToolPolicy = z.infer<typeof toolPolicySchema>;

/**
 * The policy a tag gets when the customer has not named one.
 *
 * A customer publishing against a hundred-tool server should get something
 * sensible without enumerating all hundred, and the tools whose mistakes are
 * expensive should not be the ones that slip through.
 *
 * `write` is `allow` in this release and becomes `ask` once approvals exist.
 * Defaulting it to `ask` now would mean every write tool refusing on day one,
 * since `ask` cannot yet pause for anyone. That is a behaviour change, and it
 * is documented rather than sprung.
 */
export const DEFAULT_TOOL_POLICY: Record<ToolTag, ToolPolicy> = {
  read: "allow",
  write: "allow",
  destructive: "ask",
  external: "allow",
};

/** MCP's own annotations, as a server publishes them. */
export const mcpToolAnnotationsSchema = z
  .object({
    title: z.string().optional(),
    readOnlyHint: z.boolean().optional(),
    destructiveHint: z.boolean().optional(),
    idempotentHint: z.boolean().optional(),
    openWorldHint: z.boolean().optional(),
  })
  .loose();
export type McpToolAnnotations = z.infer<typeof mcpToolAnnotationsSchema>;

/** One tool, as discovered from a server. */
export const toolSchema = z.object({
  id: z.string().describe("Unique identifier, prefixed `tol_`."),
  server_id: z.string(),
  server_name: z.string().describe("The handle an agent version pins."),
  name: z.string().describe("The tool's own name, as the server reports it."),
  description: z.string().nullable(),
  tags: z.array(toolTagSchema),
  tag_source: tagSourceSchema,
  /** What the server claimed, kept so a reader can check our reading of it. */
  annotations: mcpToolAnnotationsSchema.nullable(),
  /** What this tool gets when a version does not name it. */
  default_policy: toolPolicySchema,
  discovered_at: z.string(),
  updated_at: z.string(),
});
export type Tool = z.infer<typeof toolSchema>;

/**
 * A version's overrides, as `server.tool` to `policy`.
 *
 * Qualified by server because two servers can both offer `search`, and a policy
 * that silently applied to both would be a way to grant access nobody asked
 * for. `"github.delete_repo": "deny"`.
 *
 * Only the exceptions are stored. Everything unnamed takes its tag's default,
 * so a version stays readable and does not need rewriting when a server adds a
 * tool.
 */
export const toolPoliciesSchema = z
  .record(
    z
      .string()
      .regex(
        /^[a-z0-9-]+\.[A-Za-z0-9_-]+$/,
        "Name a tool as `server.tool`, e.g. `github.delete_repo`.",
      ),
    toolPolicySchema,
  )
  .refine((policies) => Object.keys(policies).length <= 200, {
    message: "A version may override at most 200 tools.",
  });
export type ToolPolicies = z.infer<typeof toolPoliciesSchema>;

/** How a version addresses one tool. */
export const toolKey = (server: string, tool: string) => `${server}.${tool}`;

/**
 * What a version does about one tool.
 *
 * An explicit override wins; otherwise the tool's tags decide, and the
 * strictest tag wins. A tool tagged both `read` and `destructive` is
 * destructive — a thing that reads and deletes is a thing that deletes.
 */
export function resolveToolPolicy(
  tool: { name: string; tags: readonly ToolTag[] },
  serverName: string,
  policies: ToolPolicies | undefined,
): ToolPolicy {
  const override = policies?.[toolKey(serverName, tool.name)];
  if (override) return override;

  const order: ToolPolicy[] = ["allow", "ask", "deny"];
  return tool.tags.reduce<ToolPolicy>((strictest, tag) => {
    const candidate = DEFAULT_TOOL_POLICY[tag];
    return order.indexOf(candidate) > order.indexOf(strictest) ? candidate : strictest;
  }, "allow");
}

/**
 * Tags for a tool, from the server's annotations where it published any.
 *
 * MCP's defaults are deliberately pessimistic: a tool that says nothing is
 * assumed destructive. That default is right for a client deciding whether to
 * prompt, and wrong here, because it would tag every unannotated tool on every
 * unannotated server as destructive and make the tag meaningless. So absence is
 * treated as absence: no annotations means we infer instead.
 */
export function tagsFromAnnotations(
  annotations: McpToolAnnotations | null | undefined,
): ToolTag[] | null {
  if (!annotations) return null;

  const stated =
    annotations.readOnlyHint !== undefined || annotations.destructiveHint !== undefined;
  if (!stated) return null;

  const tags: ToolTag[] = [];

  if (annotations.readOnlyHint) tags.push("read");
  else tags.push(annotations.destructiveHint === false ? "write" : "destructive");

  // A read-only tool that reaches the open web still leaves the building, which
  // is worth showing even though it changes nothing.
  if (annotations.openWorldHint) tags.push("external");

  return tags;
}

/**
 * Verbs that give a tool away.
 *
 * Used only when a server published no annotations. Ordered destructive first,
 * because the cost of the two mistakes is not symmetric: reading a destructive
 * tool as safe is how something gets deleted, and reading a safe tool as
 * destructive only means someone is asked a question they did not need.
 */
const DESTRUCTIVE = /^(delete|remove|destroy|drop|purge|truncate|revoke|kill|terminate|uninstall|reset|overwrite|replace|clear|wipe|prune|archive|close|cancel|merge|force)/i;
const WRITE = /^(create|add|insert|update|edit|modify|set|put|post|patch|write|append|send|publish|upload|push|assign|invite|comment|apply|run|execute|trigger|start|schedule|move|rename|copy|sync|import|export)/i;
const READ = /^(get|list|read|fetch|find|search|query|show|view|describe|inspect|check|count|lookup|resolve|status|health|ping|has|is)/i;
const EXTERNAL = /\b(http|https|url|web|browse|crawl|scrape|download|fetch_url|request)\b/i;

/**
 * Nixet's reading of a tool, when the server said nothing.
 *
 * A guess, and labelled as one. `archive_record` and `sync_all` are exactly the
 * cases this gets wrong, which is why an unrecognised verb is treated as a
 * write rather than a read: unknown is closer to "changes something" than to
 * "changes nothing".
 */
export function inferTags(name: string, description?: string | null): ToolTag[] {
  const subject = `${name} ${description ?? ""}`;
  const tags: ToolTag[] = [];

  if (DESTRUCTIVE.test(name)) tags.push("destructive");
  else if (READ.test(name)) tags.push("read");
  else if (WRITE.test(name)) tags.push("write");
  else tags.push("write");

  if (EXTERNAL.test(subject)) tags.push("external");

  return tags;
}
