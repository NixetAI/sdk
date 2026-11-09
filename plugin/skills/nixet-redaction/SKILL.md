---
name: nixet-redaction
description: Mask personal data before a Nixet run reaches the model. Use when the user mentions PII, redaction, masking, GDPR, sensitive customer data, or asks whether names and card numbers reach the model provider.
---

# Redaction

Personal data is masked in Nixet **before** the run is dispatched, so the
runtime and the model provider receive `[GIVEN_NAME_1]` where a name was.

```
customer → Nixet          "Marta Kowalski, card 4539 1488 0343 6467"
Nixet masks
Nixet → runtime → model   "[GIVEN_NAME_1] [SURNAME_1], card [CREDIT_CARD_1]"
model → Nixet             "Refunded [GIVEN_NAME_1]"
Nixet restores
Nixet → customer          "Refunded Marta"
```

What is stored is the masked text. What the caller reads is restored.

## State this honestly, every time

Three things are easy to sell wrongly, and all three are in the product:

- It **reduces** personal data. It does not remove it. Roughly one item in ten
  is missed, and short text ending in a name is a known weak point.
- The **trace is not masked**. Tool arguments and results are recorded as they
  were. Redaction covers run input and output only.
- It is **not a compliance control**. Never describe it as GDPR compliance, as
  anonymisation, or as a guarantee that a record is clean.

If the user asks for a guarantee, say plainly that this is not one.

## Turning it on

Redaction is a property of an agent version, so it is frozen, hashed into the
digest and pinned by every run:

```ts
await nixet.agents.versions.create(agent.id, {
  instructions: "Answer billing questions.",
  model: { provider: "nix", tier: "balanced" },
  redaction: { mode: "standard", reversible: true, retainFor: "24h" },
});
```

Changing the policy is a new version, exactly like changing the instructions.

## Choosing a mode

| mode | masks | when |
| --- | --- | --- |
| `off` | nothing | the default |
| `structured` | cards, IBANs, SSNs, passports, tax IDs | card safety while the agent still sees names |
| `standard` | every personal category | the usual choice |
| `strict` | adds the company someone works for | rarely what you want |

`structured` is the only mode whose detections all pass a real checksum — Luhn
for cards, ISO-13616 for IBANs, per-country rules for national IDs. Nothing in
it depends on the model guessing.

`strict` adds `ORG`. A company is not a person, and masking it usually removes
the context the answer needed.

`labels` narrows a mode to specific categories, which is rarely needed. A mode
alone is normally the right answer.

## Reversible or not

`reversible: false` — the default — masks and keeps nothing. Nothing to leak,
nothing to erase, and the reply comes back with placeholders in it.

`reversible: true` seals the placeholder map, encrypted and scoped to that run,
so the reply is restored on the way out. The caller reads real values; the model
never saw them. The map is destroyed when `retainFor` elapses, and after that
the stored text stays masked permanently.

Prefer irreversible unless the reply actually needs the values back.

## Reading what happened

```ts
run.redaction
// { mode: "standard", reversible: true,
//   counts: { GIVEN_NAME: 1, EMAIL: 1 }, item_count: 2, expires_at: "…" }
```

Counts, never values. The masked values are the personal data the run removed;
returning them beside the masked copy would be a labelled index of everything
sensitive in the run.

In the console, a run and a conversation both show what was masked, and a
**reveal values** control undoes it for one run. Every reveal is recorded in the
audit trail before the values are read.

## Memory is refused alongside it

The runtime would only ever see placeholders, so an agent would retain a fact
about `[GIVEN_NAME_1]` — useless immediately, unrecoverable once the map
expires. Creating such a conversation fails with a `400`.

Choose one: a version that redacts, or a conversation that remembers.

## What to check when it seems wrong

| Symptom | First thing to check |
| --- | --- |
| Nothing masked | Is `redaction` on the **version** that ran, not a later one? |
| Reply full of placeholders | `reversible` is false, which is the default |
| A name survived | Expected: about one item in ten is missed |
| Trace still shows the data | Expected: traces are not masked |
| Transcript shows placeholders | The map expired, or the run kept none |
| `503` | Redaction is not configured for that deployment |

Do not assert that a run masked something without reading `run.redaction`, and
do not describe a stored record as clean.
