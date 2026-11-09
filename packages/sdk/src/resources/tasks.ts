import type { Transport } from "../transport.js";
import type { ListParams, MemoryPolicy, Page, Provider, Task, TaskStatus } from "../types.js";

export interface CreateTaskParams {
  agentId: string;
  input: string;
  /** Pins a version. Defaults to whatever is published when the task is queued. */
  version?: string;
  conversationId?: string;
  userId?: string;
  provider?: Provider;
  memory?: MemoryPolicy;
  /** How many times to try before giving up. Defaults to three. */
  maxAttempts?: number;
}

export interface ListTaskParams extends ListParams {
  status?: TaskStatus;
  agentId?: string;
  conversationId?: string;
}

/**
 * Tasks: work that outlives the request that asked for it.
 *
 * A run has to finish inside its HTTP request. A task does not: it is queued,
 * executed by a worker, and polled for. Use it for anything that would
 * otherwise time out — research, a long report, a batch of lookups.
 *
 * ```ts
 * const task = await nixet.tasks.create({
 *   agentId: agent.id,
 *   input: "Research this company and produce a report.",
 * });
 *
 * const finished = await nixet.tasks.wait(task.id);
 * console.log(finished.output);
 * ```
 *
 * The work runs as a normal run, so `task.run_id` is where the trace, the
 * events and the cost live.
 */
export class Tasks {
  constructor(private readonly transport: Transport) {}

  /** Queue a task. Returns immediately, before the work starts. */
  create(
    params: CreateTaskParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<Task> {
    return this.transport.request<Task>({
      method: "POST",
      path: "/tasks",
      body: {
        agent_id: params.agentId,
        input: params.input,
        ...(params.version ? { agent_version: params.version } : {}),
        ...(params.conversationId ? { conversation_id: params.conversationId } : {}),
        ...(params.userId ? { user_id: params.userId } : {}),
        ...(params.provider ? { provider: params.provider } : {}),
        ...(params.memory ? { memory: params.memory } : {}),
        ...(params.maxAttempts ? { max_attempts: params.maxAttempts } : {}),
      },
      signal: options.signal,
    });
  }

  retrieve(taskId: string, options: { signal?: AbortSignal } = {}): Promise<Task> {
    return this.transport.request<Task>({
      method: "GET",
      path: `/tasks/${encodeURIComponent(taskId)}`,
      signal: options.signal,
    });
  }

  list(
    params: ListTaskParams = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<Page<Task>> {
    return this.transport.requestPage<Task>({
      method: "GET",
      path: "/tasks",
      query: {
        ...(params.limit ? { $limit: params.limit } : {}),
        ...(params.offset ? { $offset: params.offset } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.agentId ? { agent_id: params.agentId } : {}),
        ...(params.conversationId ? { conversation_id: params.conversationId } : {}),
      },
      signal: options.signal,
    });
  }

  /**
   * Stop a task.
   *
   * A queued task stops immediately. A running one is marked cancelled and the
   * worker notices when its run finishes, because interrupting a model call
   * mid-flight would still be billed for.
   */
  cancel(taskId: string, options: { signal?: AbortSignal } = {}): Promise<Task> {
    return this.transport.request<Task>({
      method: "POST",
      path: `/tasks/${encodeURIComponent(taskId)}/cancel`,
      signal: options.signal,
    });
  }

  /** Try a failed or cancelled task again, with its attempts reset. */
  retry(taskId: string, options: { signal?: AbortSignal } = {}): Promise<Task> {
    return this.transport.request<Task>({
      method: "POST",
      path: `/tasks/${encodeURIComponent(taskId)}/retry`,
      signal: options.signal,
    });
  }

  /**
   * Continue a paused task.
   *
   * Nothing pauses a task yet — that arrives with tools and approvals — so
   * this currently answers that there is nothing to resume.
   */
  resume(taskId: string, options: { signal?: AbortSignal } = {}): Promise<Task> {
    return this.transport.request<Task>({
      method: "POST",
      path: `/tasks/${encodeURIComponent(taskId)}/resume`,
      signal: options.signal,
    });
  }

  /**
   * Poll until the task stops, and return it.
   *
   * Convenience over `retrieve`, not a different mechanism: there is no push
   * for tasks yet, so this is the loop everyone would otherwise write. The
   * timeout exists so a stuck task fails the caller rather than hanging.
   */
  async wait(
    taskId: string,
    options: {
      signal?: AbortSignal;
      /** How often to check. Default two seconds. */
      intervalMs?: number;
      /** How long to keep checking. Default ten minutes. */
      timeoutMs?: number;
      onUpdate?: (task: Task) => void;
    } = {},
  ): Promise<Task> {
    const intervalMs = options.intervalMs ?? 2_000;
    const deadline = Date.now() + (options.timeoutMs ?? 600_000);

    for (;;) {
      const task = await this.retrieve(taskId, { signal: options.signal });
      options.onUpdate?.(task);

      if (
        task.status === "completed" ||
        task.status === "failed" ||
        task.status === "cancelled"
      ) {
        return task;
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `The task ${taskId} was still ${task.status} after the timeout. ` +
            "It has not been cancelled; retrieve it later to see how it ended.",
        );
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}
