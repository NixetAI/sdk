import { APIError, ConnectionError, RateLimitError, ServerError } from "./errors.js";

export interface TransportOptions {
  apiKey: string;
  baseURL: string;
  timeout: number;
  maxRetries: number;
  fetch: typeof fetch;
}

export interface RequestOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  /**
   * Send the body as multipart rather than JSON.
   *
   * One route takes a file, and bytes do not belong in JSON. When set, the
   * body is handed to fetch untouched and the Content-Type header is omitted:
   * the runtime generates a boundary and sets it, and a header we wrote would
   * be the wrong one.
   */
  form?: boolean;
  signal?: AbortSignal;
  /** Ask for an event stream rather than JSON. */
  stream?: boolean;
}

/**
 * HTTP transport.
 *
 * Retries only what is safe to retry: a connection failure, a 429, or a 5xx.
 * A 4xx means the request itself was wrong, so repeating it cannot help.
 */
export class Transport {
  constructor(private readonly options: TransportOptions) {}

  async request<T>(request: RequestOptions): Promise<T> {
    const response = await this.send(request);
    const text = await response.text();
    const body = text ? (JSON.parse(text) as { data: T }) : undefined;
    return body?.data as T;
  }

  /** List responses carry a total alongside the rows. */
  async requestPage<T>(request: RequestOptions): Promise<{ data: T[]; count: number }> {
    const response = await this.send(request);
    const body = (await response.json()) as { data: T[]; count: number };
    return { data: body.data, count: body.count };
  }

  async stream(request: RequestOptions): Promise<Response> {
    return this.send({ ...request, stream: true });
  }

  private async send(request: RequestOptions): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      try {
        const response = await this.attempt(request);
        if (response.ok) return response;

        const error = await this.toError(response);
        // A client mistake is not worth repeating; only pressure and outages are.
        const retryable = error instanceof RateLimitError || error instanceof ServerError;
        if (!retryable || attempt === this.options.maxRetries) throw error;
        lastError = error;
      } catch (error) {
        if (error instanceof APIError) {
          const retryable = error instanceof RateLimitError || error instanceof ServerError;
          if (!retryable || attempt === this.options.maxRetries) throw error;
        } else if ((error as { name?: string })?.name === "AbortError") {
          throw error;
        } else if (attempt === this.options.maxRetries) {
          throw new ConnectionError("Could not reach the Nixet API.", error);
        }
        lastError = error;
      }

      // Exponential backoff with jitter, so retries from many clients do not
      // arrive together and repeat the overload that caused them.
      const backoff = Math.min(500 * 2 ** attempt, 8000);
      await sleep(backoff * (0.5 + Math.random() * 0.5));
    }

    throw lastError instanceof Error
      ? lastError
      : new ConnectionError("Could not reach the Nixet API.");
  }

  private async attempt(request: RequestOptions): Promise<Response> {
    const url = new URL(this.options.baseURL.replace(/\/$/, "") + request.path);
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const timeout = AbortSignal.timeout(this.options.timeout);
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeout])
      : timeout;

    return this.options.fetch(url.toString(), {
      method: request.method,
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        ...(request.form ? {} : { "Content-Type": "application/json" }),
        Accept: request.stream ? "text/event-stream" : "application/json",
      },
      ...(request.body === undefined
        ? {}
        : { body: request.form ? (request.body as BodyInit) : JSON.stringify(request.body) }),
      signal,
    });
  }

  private async toError(response: Response): Promise<APIError> {
    const requestId = response.headers.get("x-request-id");
    let message = `The request failed with status ${response.status}.`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      // A body that is not JSON leaves the status-derived message in place.
    }
    return APIError.from(response.status, message, requestId);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
