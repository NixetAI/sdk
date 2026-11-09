import type { Transport } from "../transport.js";
import type {
  CreateGuardrailParams,
  Guardrail,
  GuardrailStage,
} from "@nixet/contracts";
import type { ListParams, Page } from "../types.js";

export interface ListGuardrailParams extends ListParams {
  name?: string;
  stage?: GuardrailStage;
}

/**
 * Guardrails: what an agent may be given, and what it may say.
 *
 * Defined once for the workspace and named by a version, the same way MCP
 * servers and knowledge collections are. A rule like "never name a specific
 * fund" applies to every agent a customer runs, so it is defined in one place
 * rather than once per version.
 *
 * Three stages. `input` runs before a model sees the text, `output` before a
 * caller does, and `tool_result` on what a tool returned — the one that
 * matters for an agent rendering structured data, because that never passes
 * through the agent's text and an output guard never sees it.
 *
 * Four actions. `modify` is the useful one: scrubbing a fund name and letting
 * the rest through is better behaviour than refusing the turn.
 *
 * ```ts
 * await nixet.guardrails.create({
 *   name: "pii-scrub",
 *   stage: "output",
 *   action: "modify",
 *   patterns: [{ match: "\\b\\d{12}\\b", replace: "[ACCOUNT]" }],
 * });
 *
 * await nixet.agents.versions.create(agentId, {
 *   instructions: "…",
 *   guardrails: { output: ["pii-scrub"], mode: "run_all" },
 * });
 * ```
 *
 * There is no update and no delete. A version pins a guard by name, so
 * renaming one would silently redirect what a published agent applies, and
 * removing one would leave a version naming a rule that no longer exists.
 * Editing a guard's rules does take effect on the next run everywhere it is
 * named, which is the point of defining it at workspace level.
 */
export class Guardrails {
  constructor(private readonly transport: Transport) {}

  create(
    params: CreateGuardrailParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<Guardrail> {
    return this.transport.request<Guardrail>({
      method: "POST",
      path: "/guardrails",
      body: params,
      signal: options.signal,
    });
  }

  list(
    params: ListGuardrailParams = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<Page<Guardrail>> {
    return this.transport.requestPage<Guardrail>({
      method: "GET",
      path: "/guardrails",
      // Mapped rather than spread: `$limit` is the wire name and `limit` is
      // the one a caller writes, and spreading would send both.
      query: {
        $limit: params.limit,
        $offset: params.offset,
        name: params.name,
        stage: params.stage,
      },
      signal: options.signal,
    });
  }

  retrieve(id: string, options: { signal?: AbortSignal } = {}): Promise<Guardrail> {
    return this.transport.request<Guardrail>({
      method: "GET",
      path: `/guardrails/${id}`,
      signal: options.signal,
    });
  }
}
