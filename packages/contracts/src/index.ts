/**
 * Public Nixet wire contract.
 *
 * One definition shared by the API, the TypeScript client and the dashboard
 * bindings, so a released shape cannot drift between them.
 */
export * from "./primitives.js";
export * from "./domains/identity.js";
export * from "./domains/api-keys.js";
export * from "./domains/agents.js";
export * from "./domains/skills.js";
export * from "./domains/runs.js";
export * from "./domains/users.js";
export * from "./domains/conversations.js";
export * from "./domains/memory.js";
export * from "./domains/redaction.js";
export * from "./domains/mcp.js";
export * from "./domains/connections.js";
export * from "./domains/documents.js";
export * from "./domains/guardrails.js";
export * from "./domains/tools.js";
export * from "./domains/knowledge.js";
export * from "./domains/billing.js";
export * from "./domains/secrets.js";
export * from "./domains/tasks.js";
