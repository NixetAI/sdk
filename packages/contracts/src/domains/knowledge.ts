import { z } from "zod";

/**
 * Knowledge: a customer's own documents, searchable by an agent.
 *
 * A collection is a named index an agent version pins, the way it pins an MCP
 * server. A source is one document in it. Chunks are what a search returns,
 * and they are not a resource here: they live in the vector store the runtime
 * owns, because a hundred chunks of one PDF do not belong in a response about
 * that PDF.
 *
 * Ingestion is asynchronous. A source is registered immediately and processed
 * by a worker, so the status on the row is the honest answer to "can my agent
 * use this yet".
 */

/** Where a source's content came from. */
export const sourceKindSchema = z.enum(["file", "text", "url"]);
export type SourceKind = z.infer<typeof sourceKindSchema>;

/**
 * How far a source has got.
 *
 * Named after the step in progress rather than a generic "processing", so a
 * customer waiting on a slow document can see whether it is being OCR'd — the
 * one step that takes minutes rather than milliseconds.
 */
export const sourceStatusSchema = z.enum([
  "pending",
  "converting",
  "ocr",
  "chunking",
  "embedding",
  "ready",
  "failed",
]);
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

/**
 * How a collection splits a document.
 *
 * `markdown` follows headings, which suits documents with a structure worth
 * preserving. `recursive` splits on paragraph and sentence boundaries and is
 * the safe default for prose that has none.
 */
export const chunkStrategySchema = z.enum(["markdown", "recursive"]);
export type ChunkStrategy = z.infer<typeof chunkStrategySchema>;

export const knowledgeNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and hyphens, e.g. `support-policies`.",
  );

/**
 * A collection.
 *
 * `chunk_size` and `chunk_overlap` are fixed when it is created, because
 * changing them would make the chunks already in it inconsistent with the ones
 * added next. Re-chunking differently means a new collection.
 */
export const knowledgeCollectionSchema = z.object({
  id: z.string().describe("Unique identifier, prefixed `kbc_`."),
  name: z
    .string()
    .describe("Stable handle a version pins, e.g. `support-policies`."),
  description: z.string().nullable(),
  chunk_strategy: chunkStrategySchema,
  chunk_size: z.number(),
  chunk_overlap: z.number(),
  /** The model that embedded every chunk in here. */
  embedding_model: z.string(),
  /** How many sources are in this collection, whatever their status. */
  source_count: z.number(),
  /** Chunks across every source that reached `ready`. */
  chunk_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type KnowledgeCollection = z.infer<typeof knowledgeCollectionSchema>;

export const createKnowledgeCollectionSchema = z
  .object({
    name: knowledgeNameSchema,
    description: z.string().trim().max(200).optional(),
    chunk_strategy: chunkStrategySchema.default("recursive"),
    chunk_size: z.number().int().min(128).max(8000).default(1000),
    chunk_overlap: z.number().int().min(0).max(2000).default(200),
  })
  .strict()
  .refine((value) => value.chunk_overlap < value.chunk_size, {
    message: "chunk_overlap must be smaller than chunk_size.",
    path: ["chunk_overlap"],
  });
export type CreateKnowledgeCollectionRequest = z.infer<
  typeof createKnowledgeCollectionSchema
>;

/**
 * A source.
 *
 * `storage_key` and `checksum` describe the original, which is kept:
 * re-chunking at a different size, or re-running a better OCR engine, should
 * not require the customer to upload the file again.
 *
 * `generation` increments when a source is re-ingested. The chunks of an older
 * generation stay in the store, so a run that already happened can still be
 * explained by what it actually searched.
 */
export const knowledgeSourceSchema = z.object({
  id: z.string().describe("Unique identifier, prefixed `kbs_`."),
  collection_id: z.string(),
  /** The collection's handle, so a source can be read without a second call. */
  collection_name: z.string(),
  kind: sourceKindSchema,
  /** A file's original name, a URL, or a title given to pasted text. */
  title: z.string(),
  status: sourceStatusSchema,
  /** Why ingestion failed, when it did. */
  error: z.string().nullable(),
  /** Bytes of the original. Zero for text that was pasted rather than uploaded. */
  size: z.number(),
  mime_type: z.string().nullable(),
  checksum: z.string().nullable(),
  /** How many chunks this source produced. Zero until it is `ready`. */
  chunk_count: z.number(),
  /**
   * Pages that needed OCR, and how many there were.
   *
   * The converter names the scanned pages when it refuses a PDF, so "2 of 340 pages
   * were scanned" is answerable when someone asks why ingestion was slow.
   */
  ocr_pages: z.array(z.number()).nullable(),
  page_count: z.number().nullable(),
  /**
   * The page a `url` source was actually read from, when a redirect moved it.
   *
   * Null when nothing redirected, and for every other kind. `title` holds the
   * address that was asked for, so a source that ended up somewhere else says
   * both.
   */
  fetched_url: z.string().nullable(),
  generation: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

/**
 * Registering a source.
 *
 * A file arrives as multipart rather than through this schema — bytes do not
 * belong in JSON — so this covers `text` and `url`, and the file path carries
 * its own validation.
 */
export const createKnowledgeSourceSchema = z
  .object({
    collection: knowledgeNameSchema,
    kind: z.enum(["text", "url"]),
    title: z.string().trim().min(1).max(200),
    /** The text itself for `text`, the address for `url`. */
    content: z.string().trim().min(1).max(1_000_000),
  })
  .strict();
export type CreateKnowledgeSourceRequest = z.infer<
  typeof createKnowledgeSourceSchema
>;

/**
 * What a run searched, recorded on the trace.
 *
 * The chunk's text is not here. A trace is read by people who may not be
 * entitled to the document, and a retrieval event that quoted it would be a
 * copy of the content outside the store that governs access to it.
 */
export const retrievedChunkSchema = z.object({
  source_id: z.string(),
  source_title: z.string(),
  collection_name: z.string(),
  score: z.number(),
  generation: z.number(),
});
export type RetrievedChunk = z.infer<typeof retrievedChunkSchema>;

/** The states a worker may claim, and what it moves them to. */
export const INGESTIBLE_STATUSES: readonly SourceStatus[] = ["pending"];

/** Statuses from which nothing further happens on its own. */
export const TERMINAL_STATUSES: readonly SourceStatus[] = ["ready", "failed"];

/** Whether a source is still on its way to being searchable. */
export function isInFlight(status: SourceStatus): boolean {
  return !TERMINAL_STATUSES.includes(status);
}
