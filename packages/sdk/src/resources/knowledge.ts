import type { Transport } from "../transport.js";
import type {
  ChunkStrategy,
  KnowledgeCollection,
  KnowledgeSource,
  ListParams,
  Page,
  SourceStatus,
} from "../types.js";

export interface CreateKnowledgeCollectionParams {
  /** Lowercase and hyphenated. This is what an agent version pins. */
  name: string;
  description?: string;
  /** Defaults to `recursive`. Fixed once the collection exists. */
  chunkStrategy?: ChunkStrategy;
  /** Characters per chunk, 128 to 8000. Defaults to 1000. Fixed at creation. */
  chunkSize?: number;
  /**
   * Characters each chunk repeats from the one before, 0 to 2000. Defaults to
   * 200, and must be smaller than `chunkSize`. Fixed at creation.
   */
  chunkOverlap?: number;
}

export interface ListKnowledgeCollectionParams extends ListParams {
  /** Find one collection by its name. */
  name?: string;
}

export interface CreateKnowledgeSourceParams {
  /** The collection's name, not its id — the same handle a version pins. */
  collection: string;
  /** `file` is not here: bytes arrive as multipart, on the upload route. */
  kind: "text" | "url";
  title: string;
  /** The text itself for `text`, the address for `url`. */
  content: string;
}

export interface ListKnowledgeSourceParams extends ListParams {
  collectionId?: string;
  /** Usually `ready` or `failed`: what an agent can search, and what went wrong. */
  status?: SourceStatus;
}

/**
 * Collections: the named indexes an agent version searches.
 *
 * A collection is a container and a chunking rule, nothing more. The documents
 * in it are sources, and the chunks those produce live in the vector store the
 * runtime owns.
 *
 * There is no update. The chunk settings are what a collection is, and they
 * cannot change without the chunks already stored disagreeing with the ones
 * added next: half an index split at 1000 characters and half at 400 retrieves
 * badly, and nothing could honestly report which half a run searched. The name
 * is fixed for the reason a secret's name is, since a published version pins
 * it and a rename would silently redirect what a running agent searches.
 * Re-chunking means creating another collection.
 */
export class KnowledgeCollections {
  constructor(private readonly transport: Transport) {}

  create(
    params: CreateKnowledgeCollectionParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<KnowledgeCollection> {
    return this.transport.request<KnowledgeCollection>({
      method: "POST",
      path: "/knowledge/collections",
      body: {
        name: params.name,
        ...(params.description ? { description: params.description } : {}),
        ...(params.chunkStrategy ? { chunk_strategy: params.chunkStrategy } : {}),
        ...(params.chunkSize === undefined ? {} : { chunk_size: params.chunkSize }),
        ...(params.chunkOverlap === undefined
          ? {}
          : { chunk_overlap: params.chunkOverlap }),
      },
      signal: options.signal,
    });
  }

  retrieve(
    collectionId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<KnowledgeCollection> {
    return this.transport.request<KnowledgeCollection>({
      method: "GET",
      path: `/knowledge/collections/${encodeURIComponent(collectionId)}`,
      signal: options.signal,
    });
  }

  /**
   * Collections, by name.
   *
   * `source_count` is every document whatever its status, while `chunk_count`
   * covers only the sources that finished, so an index still being ingested
   * reads as emptier than it will be.
   */
  list(
    params: ListKnowledgeCollectionParams = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<Page<KnowledgeCollection>> {
    return this.transport.requestPage<KnowledgeCollection>({
      method: "GET",
      path: "/knowledge/collections",
      query: {
        $limit: params.limit,
        $offset: params.offset,
        name: params.name,
      },
      signal: options.signal,
    });
  }

  /**
   * Delete a collection.
   *
   * Refused while it still holds sources. Their chunks are in the vector store
   * rather than beside this row, so dropping the collection first would leave
   * them with nothing describing them and no scope key that resolves —
   * orphaned vectors a later search could still match. Remove the sources
   * first; their chunks go with them.
   *
   * A published version that named this collection can no longer search it,
   * because a version is frozen and cannot be edited to drop the reference.
   */
  del(
    collectionId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<KnowledgeCollection> {
    return this.transport.request<KnowledgeCollection>({
      method: "DELETE",
      path: `/knowledge/collections/${encodeURIComponent(collectionId)}`,
      signal: options.signal,
    });
  }
}

/**
 * Sources: the documents inside a collection.
 *
 * Registering one writes a row and returns. Converting, OCR'ing, chunking and
 * embedding all happen afterwards in a worker, because a scanned PDF of three
 * hundred pages takes minutes and nothing useful comes of holding an HTTP
 * request open for it. So `create` answers `pending` rather than `ready`, and
 * `status` is the honest answer to "can my agent use this yet" — which is why
 * it names the step in progress rather than a generic "processing".
 *
 * Uploading a file is `POST /v1/knowledge/sources/upload`, a multipart request
 * this SDK does not yet wrap; `create` covers `text` and `url`, since bytes do
 * not belong in JSON.
 *
 * There is no update. A source is what was ingested: its chunks were produced
 * from the bytes on record, so editing the title or the content here would
 * leave a row describing something other than what an agent actually searches.
 * Replacing a document means ingesting it again.
 */
export class KnowledgeSources {
  constructor(private readonly transport: Transport) {}

  /**
   * Register a document. Returns before it is searchable.
   *
   * Poll `retrieve` until `status` is `ready`, or `failed` with `error` saying
   * why. A URL is fetched by the worker rather than by this call, so an
   * address that cannot be reached surfaces there too.
   */
  create(
    params: CreateKnowledgeSourceParams,
    options: { signal?: AbortSignal } = {},
  ): Promise<KnowledgeSource> {
    return this.transport.request<KnowledgeSource>({
      method: "POST",
      path: "/knowledge/sources",
      body: {
        collection: params.collection,
        kind: params.kind,
        title: params.title,
        content: params.content,
      },
      signal: options.signal,
    });
  }

  retrieve(
    sourceId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<KnowledgeSource> {
    return this.transport.request<KnowledgeSource>({
      method: "GET",
      path: `/knowledge/sources/${encodeURIComponent(sourceId)}`,
      signal: options.signal,
    });
  }

  /**
   * Sources, newest first, because the one someone is waiting on is the one
   * they just added. Filter on `status` to see what is actually searchable.
   */
  list(
    params: ListKnowledgeSourceParams = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<Page<KnowledgeSource>> {
    return this.transport.requestPage<KnowledgeSource>({
      method: "GET",
      path: "/knowledge/sources",
      query: {
        $limit: params.limit,
        $offset: params.offset,
        collection_id: params.collectionId,
        status: params.status,
      },
      signal: options.signal,
    });
  }

  /**
   * Delete a source.
   *
   * This is what removes a document from an index, and therefore what an
   * erasure request is served by. The original is deleted before the row, so a
   * failure leaves something to retry rather than a file in storage with
   * nothing pointing at it.
   */
  del(
    sourceId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<KnowledgeSource> {
    return this.transport.request<KnowledgeSource>({
      method: "DELETE",
      path: `/knowledge/sources/${encodeURIComponent(sourceId)}`,
      signal: options.signal,
    });
  }
}

/**
 * Knowledge: your own documents, searchable by an agent.
 *
 * ```ts
 * const collection = await nixet.knowledge.collections.create({
 *   name: "support-policies",
 *   chunkStrategy: "markdown",
 * });
 *
 * const source = await nixet.knowledge.sources.create({
 *   collection: collection.name,
 *   kind: "text",
 *   title: "Refunds",
 *   content: "The refund window is thirty days.",
 * });
 *
 * // Ingestion is asynchronous, so the source is `pending` here. Poll until
 * // it is `ready` before expecting an agent to find anything in it.
 * source.status; // "pending"
 * ```
 *
 * Two sub-resources rather than one, because a collection and a source are
 * different lifetimes: a collection is a chunking rule fixed at creation, and
 * a source is a document that arrives, is processed and can be removed on its
 * own. A version pins a collection by name, the way it pins an MCP server, so
 * adding a document changes what a published agent can find without
 * republishing it.
 */
export class Knowledge {
  constructor(
    /** Sub-resource, so `nixet.knowledge.collections.create(...)` reads naturally. */
    readonly collections: KnowledgeCollections,
    /**
     * Sub-resource for the documents in a collection.
     *
     * Uploading a file is `POST /v1/knowledge/sources/upload` as multipart,
     * which this SDK does not yet wrap; `sources.create` covers `text` and
     * `url`.
     */
    readonly sources: KnowledgeSources,
  ) {}
}
