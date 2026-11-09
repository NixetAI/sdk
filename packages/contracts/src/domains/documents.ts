import { z } from "zod";

/**
 * Converting a document to Markdown.
 *
 * The same conversion knowledge ingestion runs, exposed on its own. Ingestion
 * chunks and embeds what it converts and keeps the result in a vector store;
 * this answers with the Markdown and stores nothing, which is what a caller
 * wanting to read a PDF rather than search it needs.
 *
 * Synchronous, so the Markdown is in the response rather than behind a job id.
 * That is only honest below a size: conversion is local and fast for a
 * document with a text layer, and a scanned document needs an OCR engine and
 * minutes rather than milliseconds. The limit here is what keeps the
 * difference from reaching the caller as a timeout.
 */

/** Fourteen formats, identified from content rather than extension. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export const documentConversionSchema = z.object({
  /** The document, as Markdown. */
  markdown: z.string(),
  /** Bytes read. Useful when the caller streamed rather than measured. */
  bytes: z.number().int().nonnegative(),
  /**
   * Pages that held no text and were read by an OCR engine.
   *
   * Empty for a document with a text layer, which is most of them. Non-empty
   * means the Markdown came from reading pictures of text, and is worth
   * showing a caller deciding whether to trust it.
   */
  ocr_pages: z.array(z.number().int().positive()),
  /** Total pages, where the format has them. Null for a spreadsheet. */
  page_count: z.number().int().positive().nullable(),
});
export type DocumentConversion = z.infer<typeof documentConversionSchema>;

/**
 * A conversion, and the knowledge source it was filed as if one was asked for.
 *
 * Converting stores nothing by default: the bytes live for the length of the
 * request and the Markdown is the answer. Naming a collection keeps the
 * document as well, which means it is chunked, embedded and searchable by an
 * agent — the same thing uploading it as a source would have done, in one
 * call instead of two.
 *
 * `source` is null when nothing was stored, rather than the field being
 * absent, so a caller reads one shape either way.
 */
export const documentConversionResultSchema = documentConversionSchema.extend({
  source: z
    .object({
      id: z.string().describe("Identifier of the stored source, prefixed `src_`."),
      collection: z.string(),
      /**
       * Always `pending` here.
       *
       * The row is written once the bytes are in storage, and a worker claims
       * it afterwards to chunk and embed. So the Markdown in this response is
       * ready and the searchable copy is not yet.
       */
      status: z.string(),
    })
    .nullable(),
});
export type DocumentConversionResult = z.infer<typeof documentConversionResultSchema>;
