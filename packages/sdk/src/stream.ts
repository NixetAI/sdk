import type { Run, RunEvent } from "./types.js";

/**
 * A live run.
 *
 * Iterate it for events, await `text()` for the finished output, or attach
 * handlers. All three read the same underlying stream, so choose one style per
 * run rather than mixing them.
 *
 * ```ts
 * for await (const event of stream) {
 *   if (event.type === "run.output") process.stdout.write(event.data ?? "");
 * }
 * ```
 */
export class RunStream implements AsyncIterable<RunEvent> {
  /**
   * Resolves once the server acknowledges the run, before it finishes.
   *
   * Awaiting this starts reading the stream, so it is safe to call before
   * iterating: the acceptance frame is consumed here and the events that follow
   * are buffered for whichever reader comes next.
   */
  readonly runId: Promise<string>;

  private readonly response: Response;
  private readonly handlers = new Map<string, Set<(event: RunEvent) => void>>();
  private resolveRunId!: (id: string) => void;
  private rejectRunId!: (error: unknown) => void;
  private consumed = false;
  /** Events read while resolving `runId`, replayed to the first real reader. */
  private buffered: RunEvent[] = [];
  private reading: Promise<void> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private pending = "";
  private readonly decoder = new TextDecoder();

  constructor(response: Response) {
    this.response = response;
    this.runId = new Promise((resolve, reject) => {
      this.resolveRunId = resolve;
      this.rejectRunId = reject;
      // The acceptance frame arrives first, so start reading rather than
      // waiting for a consumer that may only appear after this is awaited.
      queueMicrotask(() => this.pump());
    });
  }

  /**
   * Subscribe to one event type, or to `"*"` for all of them.
   * Returns an unsubscribe function.
   */
  on(type: RunEvent["type"] | "*", handler: (event: RunEvent) => void): () => void {
    const existing = this.handlers.get(type) ?? new Set();
    existing.add(handler);
    this.handlers.set(type, existing);
    return () => existing.delete(handler);
  }

  /** The concatenated output, once the run finishes. */
  async text(): Promise<string> {
    let output = "";
    for await (const event of this) {
      if (event.type === "run.output" && event.data) output += event.data;
    }
    return output;
  }

  /** Only the text deltas, for writing straight to a terminal or a socket. */
  async *chunks(): AsyncGenerator<string> {
    for await (const event of this) {
      if (event.type === "run.output" && event.data) yield event.data;
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<RunEvent> {
    if (this.consumed) {
      throw new Error("This run stream has already been read.");
    }
    this.consumed = true;

    // Anything the run-id pump already read is replayed first, so no event is
    // lost between acknowledgement and the first consumer.
    await this.reading;
    for (const event of this.buffered) yield event;
    this.buffered = [];

    for (;;) {
      const event = await this.next();
      if (!event) break;
      this.emit(event);
      yield event;
    }
  }

  /**
   * Read until the acceptance frame arrives, then stop.
   *
   * Runs once, so `runId` is available without a consumer while the events
   * after it stay queued for the first reader.
   */
  private pump(): void {
    if (this.reading) return;
    this.reading = (async () => {
      try {
        for (;;) {
          const event = await this.next();
          if (!event) break;
          this.buffered.push(event);
          break;
        }
      } catch (error) {
        this.rejectRunId(error);
      }
    })();
  }

  /** One event from the shared cursor, or null at end of stream. */
  private async next(): Promise<RunEvent | null> {
    if (!this.reader) {
      const body = this.response.body;
      if (!body) throw new Error("The response carried no stream.");
      this.reader = body.getReader();
    }

    for (;;) {
      // A frame may already be buffered from a previous chunk.
      let boundary = this.pending.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = this.pending.slice(0, boundary).trim();
        this.pending = this.pending.slice(boundary + 2);
        boundary = this.pending.indexOf("\n\n");

        const event = parse(frame);
        if (!event) continue;

        if (isAcceptance(event)) {
          this.resolveRunId(event.run_id);
          continue;
        }
        return event;
      }

      const { done, value } = await this.reader.read();
      if (done) {
        // A stream that ends without acknowledging leaves `runId` pending.
        this.rejectRunId(new Error("The run was never acknowledged."));
        return null;
      }
      this.pending += this.decoder.decode(value, { stream: true });
    }
  }

  private emit(event: RunEvent): void {
    for (const handler of this.handlers.get(event.type) ?? []) handler(event);
    for (const handler of this.handlers.get("*") ?? []) handler(event);
  }
}

type Acceptance = { type: "run.accepted"; run_id: string };

function isAcceptance(event: RunEvent | Acceptance): event is Acceptance {
  return event.type === "run.accepted";
}

function parse(frame: string): RunEvent | Acceptance | null {
  if (!frame.startsWith("data:")) return null;
  try {
    return JSON.parse(frame.slice(5).trim());
  } catch {
    // A malformed frame is dropped rather than failing an otherwise good run.
    return null;
  }
}

export type { Run };
