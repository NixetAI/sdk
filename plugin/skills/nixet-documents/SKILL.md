---
name: nixet-documents
description: Convert a document to Markdown, optionally filing it into a knowledge collection. Use when the user mentions converting or parsing a PDF, Word, Excel or PowerPoint file, extracting text from a document, a password-protected PDF, or uploading a file into knowledge.
---

# Document conversion

`documents.convert` turns a document into Markdown and returns it in the
response. Nothing is stored unless you ask.

```ts
import { openAsBlob } from "node:fs";

const result = await nixet.documents.convert({
  file: await openAsBlob("statement.pdf"),
});

result.markdown;     // the document
result.page_count;   // null for a spreadsheet
result.ocr_pages;    // pages read by OCR, if any
result.bytes;
result.source;       // null: nothing was stored
```

## Formats

PDF, Word (`doc`, `docx`), Excel (`xlsx`), PowerPoint (`ppt`, `pptx`),
OpenDocument (`odt`, `ods`, `odp`), RTF, EPUB and CSV. The format is read from
the file's **content**, not its extension. CSV has no signature, so it is the
one format that needs a filename:

```ts
await nixet.documents.convert({ file: bytes, filename: "export.csv" });
```

A `Blob` or `File` keeps its own name. Pass `filename` whenever `file` is a
`Uint8Array`.

Files up to **20 MB**. Conversion is synchronous, so the limit is lower than
for an ingested knowledge source, which a worker processes in the background.

**Scanned PDFs with no text layer fail**, with an error naming the pages. No
OCR engine is available yet. Most PDFs have a text layer and convert fine.

## Password-protected PDFs

```ts
await nixet.documents.convert({ file, password: "1234" });
```

The password opens the document and is then dropped: not stored, not logged,
not returned. The errors are deliberately different:

| Error | Meaning | What to do |
| --- | --- | --- |
| No password given | The PDF is protected | Ask the user for the password |
| Wrong password | The password did not open it | Ask again |

## Storing as knowledge

Name a collection and the document is also kept as a knowledge source —
chunked, embedded and searchable by agents that name that collection:

```ts
const { markdown, source } = await nixet.documents.convert({
  file,
  collection: "support-policies",
  title: "Refund policy 2026",        // defaults to the file's name
});

source;   // { id, collection, status: "pending" }
```

This is the SDK's way to put a **file** into a collection;
`knowledge.sources.create` takes only `text` and `url`. It needs the
`knowledge:write` permission. The source is still `pending` when the call
returns; poll `knowledge.sources.retrieve(source.id)` until `ready` before
expecting an agent to find it. See `nixet-knowledge`.

**A password and a collection cannot be combined.** The password is not kept,
so the only original Nixet could store is the encrypted one, and nothing could
ever open it again to re-ingest it. Convert without a collection, then add the
Markdown as a `text` source if the user wants it searchable.

## Cancelling

`signal` goes **inside** the params here, unlike every other method:

```ts
await nixet.documents.convert({ file, signal: controller.signal });
```

## Convert or ingest?

| Want | Use |
| --- | --- |
| The document's text, now | `documents.convert` |
| An agent able to search it later | `documents.convert` with `collection`, or `knowledge.sources.create` for text and URLs |
| Both | `documents.convert` with `collection` — one call |

## What to check

| Symptom | What it means |
| --- | --- |
| Error naming pages | Scanned pages and no OCR engine. Ask for a text-based PDF |
| CSV read as plain text or refused | Pass `filename` ending in `.csv` |
| `400`, "larger than the 20MB limit" | Split the document, or convert it in parts |
| `400` with `password` and `collection` | Not combinable. Convert, then add the text |
| `403` when storing | The key lacks `knowledge:write` |
| Agent cannot find a stored document | The source is still `pending`; wait for `ready` |

Full signatures: [api.md](../nixet-sdk/references/api.md#documents).
