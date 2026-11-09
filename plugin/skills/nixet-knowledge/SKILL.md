---
name: nixet-knowledge
description: Give an agent your own documents to answer from, and work out why one is not searchable yet. Use when the user mentions knowledge, documents, RAG, retrieval, uploading a PDF, embedding, chunking, a collection, or asks why an agent cannot find something they added.
---

# Knowledge bases

Two resources, and the split matters. A **collection** is a named index with a
chunking rule. A **source** is one document in it.

```
collection (name + chunking rule, fixed)
  └─ source (a document, ingested asynchronously)
       └─ chunks (not a resource you see; they live beside the vector index)
```

A version pins a collection **by name**, the way it pins an MCP server, so a
document added tomorrow is found without republishing.

## Making a collection

```ts
const collection = await nixet.knowledge.collections.create({
  name: "support-policies",      // the handle a version pins; fixed
  description: "Support policies the agent may answer from.",
  chunkStrategy: "markdown",
  chunkSize: 400,
  chunkOverlap: 50,
});

collection.embedding_model   // what embedded every chunk in here
collection.source_count      // documents, whatever their status
collection.chunk_count       // chunks across sources that reached `ready`
```

| Field | Default | Range |
| --- | --- | --- |
| `chunkStrategy` | `recursive` | `markdown`, `recursive` |
| `chunkSize` | 1000 characters | 128 – 8000 |
| `chunkOverlap` | 200 characters | 0 – 2000, smaller than `chunkSize` |

`markdown` follows headings, so a section stays with its own title.
`recursive` splits on paragraph and sentence boundaries and is the safe choice
for prose with no structure to follow.

`source_count` counts every document whatever its status while `chunk_count`
covers only the ones that finished, so an index still ingesting reads as
emptier than it will be.

### The chunk settings cannot change, and the reason is not caution

There is no `update`. The chunk settings are what a collection **is**: changing
them would make the chunks already stored disagree with the ones added next.
Half an index split at 1000 characters and half at 400 retrieves badly, and
nothing could honestly report which half a run searched.

The name is fixed for the reason a secret's name is — a published version pins
it, and a rename would silently redirect what a running agent searches.
Re-chunking means another collection.

Deleting one is refused while it still holds sources. Their chunks are in the
vector store rather than beside the collection row, so dropping the collection
first would leave vectors with no scope key that resolves — orphans a later
search could still match. Remove the sources first.

## Three kinds of source

```ts
const source = await nixet.knowledge.sources.create({
  collection: collection.name,   // the name, not the id
  kind: "text",
  title: "Refund policy",
  content: "# Refund policy\n\nRefunds are issued within 30 days.",
});
```

| Kind | `content` is | How it is read |
| --- | --- | --- |
| `text` | The text itself | Already text. Skips conversion entirely |
| `url` | The address | A worker fetches it, then extracts the main content |
| `file` | — | Multipart upload, not this route |

A file goes to `POST /v1/knowledge/sources/upload` as multipart, which the SDK
does not wrap — bytes do not belong in JSON. `sources.create` covers `text` and
`url` only, and `kind: "file"` is not in its type.

There is no `update` on a source either. A source is what was ingested: its
chunks were produced from the bytes on record, so editing the title or content
would leave a row describing something other than what an agent searches.
Replacing a document means ingesting it again, which increments `generation` —
and the older generation's chunks stay in the store, so a run that already
happened can still be explained by what it actually searched.

## Status is the honest answer to "can my agent use this yet"

`create` writes a row and returns. Converting, chunking and embedding happen in
a worker, because a scanned PDF of three hundred pages takes minutes and
nothing useful comes of holding an HTTP request open for it. So:

```
pending → converting → ocr → chunking → embedding → ready
                                                  ↘ failed
```

The statuses name the step in progress rather than a generic "processing", so a
customer waiting on a slow document can see whether it is being OCR'd — the one
step that takes minutes rather than milliseconds.

Poll, because there is nothing to await; the worker is a separate process and
the row is how it reports progress:

```ts
let current = source;
for (let attempt = 0; attempt < 60 && current.status !== "ready"; attempt += 1) {
  if (current.status === "failed") break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
  current = await nixet.knowledge.sources.retrieve(source.id);
}
```

```ts
await nixet.knowledge.sources.list({ collectionId: collection.id, status: "ready" });
```

**A source that stays `pending` for more than a few minutes is not normal.** Most
documents are ready within a minute. Retrieve it again later, and if it has not
moved, contact Nixet support with the source id.

## A URL is fetched with a guard that re-checks every redirect

Registering a `url` source makes the runtime's network reachable from a
customer's configuration, so the address is checked before anything connects to
it — and the check is on the **resolved** address rather than the name:

- A hostname that looks external can resolve to a private one, so every address
  a name resolves to is checked, not just the first.
- Redirects are followed by hand, at most five hops, **each one re-checked**. A
  public URL that 302s to `169.254.169.254` is the whole technique, and a guard
  that only looked at what the customer typed would pass it straight through.
- Private, loopback, link-local, carrier-grade NAT, multicast and reserved
  ranges are refused by explicit list. An IPv4 address written as IPv6 is
  unwrapped first, or `::ffff:7f00:1` would pass the v6 list and reach loopback.
- 10 MB cap, measured while reading rather than from `Content-Length`, which is
  the sending server's claim and absent on a chunked response. 30 second
  timeout.

The refusal reaches you on the source row and names the address:

```
Nixet will not fetch internal.example.com: it resolves to 10.0.1.14, which is
a private or reserved address.
```

HTML goes through an extractor that drops nav, script and style — a docs page is
mostly navigation, and chunks cut from a sidebar retrieve about as well as the
sidebar deserves. When a redirect moved the page, `fetched_url` records where it
actually came from while `title` keeps the address you asked for.

## A scanned PDF fails. Say so plainly

The converter does not OCR, and **no OCR engine is built yet.** A PDF whose
pages are scans fails, and the error names exactly which ones, 1-indexed:

```
Pages 2, 7 of 340 are scanned images with no text to read, and no OCR engine is
configured. Re-export the document with a text layer, or set
KNOWLEDGE_OCR_ENGINE once one is available.
```

Naming the pages is the useful part: "2 of 340" tells you whether to re-export
one page or the whole file. Past ten scanned pages the message lists the first
ten and counts the rest.

The engine interface exists — an abstract base with an **empty registry** — so
adding one later is a file and a line rather than a change at every call site.
Until one is registered the lookup returns nothing rather than a stub that
pretends to have read something. Do not tell a user to configure
`KNOWLEDGE_OCR_ENGINE` and expect it to work; there is no value for it yet.

Conversion otherwise runs locally in Rust, in-process, with no model weights
and no network call — Word, PDF, PowerPoint, Excel, ODF, EPUB, RTF and CSV among
them. HTML is **not**, which is refused by name, and is why a `url` source takes
the fetch path instead.

## Naming a collection on a version

```ts
await nixet.agents.versions.create(agent.id, {
  instructions: "Answer support questions using the documents you are given.",
  knowledgeCollections: [collection.name],
});
```

Publishing against a collection that does not exist is **refused**. The failure
mode is otherwise quiet: a missing collection retrieves nothing rather than
erroring, so the agent would answer from the model alone and look like it had
simply found nothing in your documents.

```
These knowledge collections were not found in this environment: support-polices.
Create them before publishing a version that searches them.
```

An *empty* collection is allowed — naming one before its first upload finishes
is a reasonable order to work in, and it becomes searchable without
republishing.

## Retrieval is scoped per tenant, and the scope is one field

Retrieval runs **before** the model is called, so passages arrive as context
rather than something the agent fetches. Up to five per run: chunks are around a
thousand characters, so five is a few thousand tokens — enough to answer from
without crowding out the conversation. Two collections do not return twice as
much; results are interleaved by rank and trimmed.

Every chunk is stored against a single composite key covering the organization,
project, environment and collection, and a search filters on a plain equality
against that one key. One field rather than four, because four fields are four
chances to write a filter that omits one. **There is no way to express "any
collection": a partial key addresses nothing rather than more.**

The scope is built once and applied whole, to the metadata on write and to the
filter on read, so one workspace's documents can never be returned to another.

## What the trace says, and what it does not

```ts
const events = await nixet.runs.events(run.id);
const retrieval = events.data.filter((event) => event.category === "knowledge");

for (const event of retrieval) {
  console.log(event.payload?.count, event.payload?.collections, event.duration_ms);
}
```

**The passages themselves are not in the trace.** A trace is read by people who
may not be entitled to the document, so the event says how much was found and
from where, never what it said.

A retrieval failure is swallowed deliberately — an agent that cannot reach its
documents still answers, and a vector store outage must not take runs down with
it. The trace records that it failed, so a run that answered from the model
alone is distinguishable from one that found nothing.

## Cost

Retrieval does not change what a run costs you: billing is per run, and the
retrieved passages arrive as input tokens on the model call like anything else.
A longer context is a slightly higher inference figure on that run, not a second
billable event.

## Failure modes

| What you see | What it means |
| --- | --- |
| Stuck on `pending` for minutes | Not normal. Retry later, then contact support with the source id |
| `failed`, error naming pages | Scanned document, and no OCR engine exists |
| `failed`, "resolves to … private" | The URL pointed inside a network, or redirected into one |
| `failed`, "larger than the 10MB limit" | Upload the document instead of linking it |
| `failed`, "must be reachable without a login" | The page returned 4xx or 5xx to an unauthenticated fetch |
| `chunk_count: 0` on a `ready` source | The document converted to whitespace; whitespace-only chunks are dropped |
| Publish refused, "collections were not found" | A version named a collection that does not exist here |
| Agent answers from the model, trace shows `count: 0` | Nothing matched, or every source is still ingesting |
| Collection delete refused | It still holds sources. Remove those first |

Erasure is `nixet.knowledge.sources.del(id)` — deleting a source is what removes
a document from an index. The original is deleted before the row, so a failure
leaves something to retry rather than a file in storage with nothing pointing
at it.

Creating needs `knowledge:write`; reading needs `knowledge:read`, which returns
counts and the chunking rule and never a line of a document.
