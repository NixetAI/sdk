import type { Transport } from "../transport.js";
import type { DocumentConversionResult } from "@nixet/contracts";

export interface ConvertDocumentParams {
  /**
   * The document.
   *
   * A `Blob` or `File` in a browser and in Node 20+, or a `Uint8Array` with a
   * filename. The name matters only for formats with no signature of their own
   * — CSV is the one that needs it — because the format is otherwise read from
   * the content.
   */
  file: Blob | Uint8Array;
  /** Required when `file` is bytes rather than a `File`. */
  filename?: string;
  /**
   * Opens a password protected PDF.
   *
   * Used to read the document and then dropped: it is not stored, not logged
   * and not returned. A protected document cannot also be stored in a
   * collection, because nothing would be able to open the original again.
   */
  password?: string;
  /**
   * Keep the document as a knowledge source in this collection.
   *
   * Omitted, nothing is stored: the bytes live for the length of the request
   * and the Markdown is the whole answer. Named, the document is also chunked
   * and embedded so an agent can search it, which needs `knowledge:write`.
   */
  collection?: string;
  /** Defaults to the file's own name. Only used when storing. */
  title?: string;
  signal?: AbortSignal;
}

/**
 * Reading a document.
 *
 * Converts fourteen formats to Markdown — PDF, Word, Excel, PowerPoint and the
 * rest — locally, with no third party seeing the file. A PDF whose pages are
 * scans needs an OCR engine and reports which pages it read that way.
 *
 * Separate from knowledge because the intent is different. A knowledge source
 * is converted so an agent can search it, and what comes back are chunks
 * ordered by similarity. This returns the document.
 *
 * ```ts
 * const { markdown } = await nixet.documents.convert({
 *   file: await fs.openAsBlob("statement.pdf"),
 *   password: "secret",
 * });
 * ```
 */
export class Documents {
  constructor(private readonly transport: Transport) {}

  /**
   * Convert a document to Markdown.
   *
   * Synchronous: the Markdown is in the response. That holds below the size
   * limit, which is lower than the knowledge upload limit for the same reason
   * — a caller is waiting on this, where an ingested document is converted by
   * a worker that can take as long as it needs.
   */
  async convert(params: ConvertDocumentParams): Promise<DocumentConversionResult> {
    const form = new FormData();

    // A Blob keeps its own name; bytes need one supplied. `document` is the
    // fallback rather than an error, because the name is only consulted for
    // signature-less formats.
    if (params.file instanceof Blob) {
      form.append("file", params.file, params.filename ?? "document");
    } else {
      form.append(
        "file",
        new Blob([params.file as BlobPart]),
        params.filename ?? "document",
      );
    }

    if (params.password) form.append("password", params.password);
    if (params.collection) form.append("collection", params.collection);
    if (params.title) form.append("title", params.title);

    return this.transport.request<DocumentConversionResult>({
      method: "POST",
      path: "/documents/convert",
      body: form,
      form: true,
      signal: params.signal,
    });
  }
}
