import { Agents } from "./resources/agents.js";
import { Runs } from "./resources/runs.js";
import { Skills } from "./resources/skills.js";
import { Users } from "./resources/users.js";
import { Conversations } from "./resources/conversations.js";
import { MemoryResource } from "./resources/memory.js";
import { Tasks } from "./resources/tasks.js";
import { Secrets } from "./resources/secrets.js";
import { McpServers } from "./resources/mcp-servers.js";
import { Tools } from "./resources/tools.js";
import { Documents } from "./resources/documents.js";
import { Guardrails } from "./resources/guardrails.js";
import { Connections } from "./resources/connections.js";
import {
  Knowledge,
  KnowledgeCollections,
  KnowledgeSources,
} from "./resources/knowledge.js";
import { Versions } from "./resources/versions.js";
import { Transport } from "./transport.js";
import type { Identity } from "./types.js";

export interface NixetOptions {
  /** A key created in the Nixet console. Defaults to `NIXET_API_KEY`. */
  apiKey?: string;
  baseURL?: string;
  /** Request timeout in milliseconds. Defaults to 10 minutes for long runs. */
  timeout?: number;
  /** Retries for connection failures, rate limits and server errors. */
  maxRetries?: number;
  fetch?: typeof fetch;
}

/**
 * The Nixet client.
 *
 * ```ts
 * import { Nixet } from "@nixet/sdk";
 *
 * const nixet = new Nixet();   // reads NIXET_API_KEY
 *
 * const agent = await nixet.agents.create({
 *   name: "Support Assistant",
 *   instructions: "You are concise.",
 *   tools: ["calculate"],
 * });
 *
 * const run = await nixet.runs.create(agent.id, { input: "What is 23 × 7?" });
 * console.log(run.output);
 * ```
 *
 * A key is bound to one workspace and environment, so there is nothing else to
 * configure.
 */
export class Nixet {
  readonly agents: Agents;
  readonly runs: Runs;
  readonly skills: Skills;
  readonly users: Users;
  readonly conversations: Conversations;
  readonly memory: MemoryResource;
  readonly tasks: Tasks;
  readonly secrets: Secrets;
  readonly mcpServers: McpServers;
  /** Converting a document to Markdown. */
  readonly documents: Documents;
  /** Rules applied to what an agent is given and what it says. */
  readonly guardrails: Guardrails;
  /** End users' credentials for the servers you registered. */
  readonly connections: Connections;
  readonly tools: Tools;
  readonly knowledge: Knowledge;

  private readonly transport: Transport;

  constructor(options: NixetOptions = {}) {
    const apiKey = options.apiKey ?? readEnv("NIXET_API_KEY");
    if (!apiKey) {
      throw new Error(
        "A Nixet API key is required. Pass `apiKey`, or set NIXET_API_KEY. " +
          "Create one in the console under API keys.",
      );
    }

    this.transport = new Transport({
      apiKey,
      baseURL: options.baseURL ?? readEnv("NIXET_BASE_URL") ?? "https://api.nixet.ai/v1",
      // Generous by default: a run waits on a model, not on the network.
      timeout: options.timeout ?? 600_000,
      maxRetries: options.maxRetries ?? 2,
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
    });

    const versions = new Versions(this.transport);
    this.agents = new Agents(this.transport, versions);
    this.runs = new Runs(this.transport);
    this.skills = new Skills(this.transport);
    this.users = new Users(this.transport);
    this.conversations = new Conversations(this.transport);
    this.memory = new MemoryResource(this.transport);
    this.tasks = new Tasks(this.transport);
    this.secrets = new Secrets(this.transport);
    this.mcpServers = new McpServers(this.transport);
    this.documents = new Documents(this.transport);
    this.guardrails = new Guardrails(this.transport);
    this.connections = new Connections(this.transport);
    this.tools = new Tools(this.transport);
    this.knowledge = new Knowledge(
      new KnowledgeCollections(this.transport),
      new KnowledgeSources(this.transport),
    );
  }

  /** Confirm which workspace and permissions this key carries. */
  async whoami(options: { signal?: AbortSignal } = {}): Promise<Identity> {
    return this.transport.request<Identity>({
      method: "GET",
      path: "/whoami",
      signal: options.signal,
    });
  }
}

/** Reads from Node or Deno without assuming either is present. */
function readEnv(name: string): string | undefined {
  const runtime = globalThis as { process?: { env?: Record<string, string> } };
  return runtime.process?.env?.[name];
}

export default Nixet;

export { RunStream } from "./stream.js";
export {
  APIError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  ConnectionError,
  NixetError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  ServerError,
} from "./errors.js";
export type { CreateAgentParams, CreatedAgent } from "./resources/agents.js";
export type { CreateRunParams, ListEventsParams } from "./resources/runs.js";
export type { CreateVersionParams } from "./resources/versions.js";
export type {
  CreateSkillParams,
  CreateSkillVersionParams,
} from "./resources/skills.js";
export type { CreateUserParams } from "./resources/users.js";
export type {
  CreateConversationParams,
  SendMessageParams,
} from "./resources/conversations.js";
export type {
  CreateMemoryParams,
  SearchMemoryParams,
} from "./resources/memory.js";
export type {
  CreateSecretParams,
  UpdateSecretParams,
} from "./resources/secrets.js";
export type {
  CreateMcpServerParams,
  UpdateMcpServerParams,
} from "./resources/mcp-servers.js";
export type {
  CreateKnowledgeCollectionParams,
  CreateKnowledgeSourceParams,
  ListKnowledgeCollectionParams,
  ListKnowledgeSourceParams,
} from "./resources/knowledge.js";
export type { ConvertDocumentParams } from "./resources/documents.js";
export type { ListGuardrailParams } from "./resources/guardrails.js";
export type { CreateGuardrailParams } from "@nixet/contracts";
export type {
  CreateConnectionParams,
  ListConnectionParams,
} from "./resources/connections.js";
export type * from "./types.js";
