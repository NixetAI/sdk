---
name: nixet-secrets
description: Store a credential an agent needs, and rotate it. Use when the user mentions a secret, API token, credential, bearer token, rotating a key, or asks how to read back or reveal a stored value.
---

# Secrets

A secret is a credential you give Nixet so an agent can reach something of
yours. It is written once, referenced by name, and **never returned**.

```ts
const secret = await nixet.secrets.create({
  name: "github-token",            // lowercase, hyphenated; fixed
  value: process.env.GH_PAT,
  description: "Read-only PAT for the docs repo.",
});

secret.hint        // "ghp_…"
secret.value       // does not exist, on any response
```

## Write-only, and there is no reveal path

Not "hidden by default". Not "behind a permission". There is no endpoint that
can answer with a value:

- `create`, `retrieve`, `list` and `update` all return the same shape —
  `{ id, name, description, hint, created_at, updated_at }` — and `value` is
  not a field on it.
- The one function that decrypts is called by the dispatch path when a run
  needs to put a real token in a header. **Nothing in the routes calls it.**
  It is not reachable over HTTP, and that is a property of the routing rather
  than a check someone could get wrong.
- The console has no reveal control because there is nothing for one to call.

So when a user asks to see a stored secret: they cannot, and neither can you.
The answer is to write a new value, not to read the old one.

Being able to read a secret back is what makes a secret store leak the first
time any read path is wrong. Removing the capability removes the class of bug.

## `hint` is for telling two apart, nothing else

Four characters of a token that is normally thirty or more:

```
github-token   ghp_…
github-ci      ghp_…
stripe-live    sk_l…
```

Enough for whoever stored it to recognise which is which. Useless to anyone
who reads the table. If a user asks you to verify a secret is correct from its
hint, it cannot be done — two tokens from the same provider share a prefix by
design.

## Rotating is writing a new value under the same name

```ts
await nixet.secrets.update(secret.id, { value: process.env.GH_PAT_NEW });
```

Whatever refers to it picks the new value up on its **next run**. Secrets are
resolved per dispatch rather than frozen into a version, which is exactly why a
rotation does not require republishing anything.

**The name cannot change.** A published version pins a secret by name, so a
rename would silently redirect what a running agent reaches for. The name is
also unique within an environment, for the same reason — two secrets sharing
one would make a published agent ambiguous:

```
A secret named github-token already exists here.
```

So "rotate" and "replace" are the same operation here. There is no versioning
of secrets and no rollback: the previous value is gone once overwritten.

## An MCP server's auth names a secret, it does not carry one

This is the pattern the whole design exists for:

```ts
await nixet.mcpServers.create({
  name: "github",
  url: "https://mcp.example.com/mcp",
  transport: "http",
  auth: { type: "bearer", secret: "github-token" },   // the name, not the token
});
```

Every authenticated variant names a stored secret:

| `auth` | Carries |
| --- | --- |
| `{ type: "none" }` | nothing |
| `{ type: "bearer", secret }` | a secret's **name** |
| `{ type: "header", header, secret }` | a header name and a secret's name |
| `{ type: "oauth", secret }` | a secret's name |

Which means a server's configuration can be read, listed, copied between
environments and shown in a trace without the credential travelling with it.
Reading an MCP server tells you *which* secret authenticates it and never what
that secret is.

`oauth` is an access token you obtained yourself. Nixet does not run the
authorization flow, so an expired one is **replaced**, not refreshed — which is
an `update` on the secret, not a change to the server.

See `nixet-mcp` for registering a server and deciding what it may do.

## Order matters when a credential was wrong

A server registers even when it is unreachable, with `last_error` set and
`tool_count` 0. Recovering from a bad token is two steps, and the second is
what actually re-runs discovery:

```ts
await nixet.secrets.update(secret.id, { value: correctToken });

await nixet.mcpServers.update(server.id, {
  auth: { type: "bearer", secret: "github-token" },
});
```

Updating the secret alone fixes what a *run* sends, because secrets resolve per
dispatch — but the tools on record were read through a token we no longer send,
and discovery only re-runs when the server's `url` or `auth` changes. Touching
`auth` is the deliberate way to ask for a re-read.

## Deleting one

```ts
await nixet.secrets.del(secret.id);
```

Anything naming it stops authenticating. A published version referring to this
secret will start failing against its server, and because a version is frozen
it cannot be edited to drop the reference. Check what names a secret before
deleting it.

## How it is stored

Worth being able to answer precisely, without overclaiming:

- Encrypted per row with its own data key, AES-256-GCM.
- The data key is wrapped against the row's **scope** — organization, project,
  environment and the secret's own id — using HKDF over that context. A row
  lifted into another workspace fails to open rather than decrypting under the
  wrong scope, so tenant isolation is a property of the cryptography rather
  than a `WHERE` clause someone has to remember. Two kinds of row never share a
  wrapping key even inside one workspace.
- The root key never encrypts a payload directly, only data keys, so rotating
  it rewraps a small key per row instead of rewriting every ciphertext.
- The plaintext data key is zeroed after use. That shortens the window; it does
  not erase every copy the runtime may have made, and saying otherwise would be
  overstating it.
- The same envelope the redaction vault uses, because the risk is the same: the
  table is a concentrated store of customer credentials.

In production the root key must come from a managed KMS; startup refuses an
environment variable there, because a managed KMS brings per-decrypt audit that
an env var cannot.

## Permissions

`secrets:write` to store, update or delete. `secrets:read` to list and
retrieve — which is genuinely a read, because no read returns a value.

Storing a secret is one of the few writes the console may perform, and it needs
the owner or admin role. The reason is practical: the value exists in the
customer's hands and has to reach us somehow, and asking someone to shell out
to `curl` to hand over a token is worse than a field that never reads it back.
Editing and deleting stay on the API.

A typed value must not outlive the panel that collected it — the field is
cleared as soon as the server has it.

## What to check

| Symptom | What it means |
| --- | --- |
| Looking for `value` on a response | It is not there, on any route. Write a new value instead |
| `409` on create | The name is taken in this environment |
| Server still failing after a rotation | Runs use the new value, but discovery needs `auth` touched |
| `tool_count: 0`, `last_error` set | Wrong token, wrong URL, or the server is down |
| Agent authenticating as the old credential | Check the run is new; secrets resolve per dispatch, not per version |
| Two secrets with identical hints | Expected. Same provider prefix. Use `name` to tell them apart |

Full signatures: `nixet-sdk`'s [api.md](../nixet-sdk/references/api.md).
