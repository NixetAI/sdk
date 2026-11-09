---
name: nixet-mcp
description: Give an agent your own tools over MCP, and decide what it may do with each. Use when the user mentions MCP, tool servers, connecting their own tools, an agent calling their API, tool permissions, read-only tools, or asks how to stop an agent deleting something.
---

# MCP servers and tool policy

An MCP server is tools you run. You register it, an agent version names it, and
the runtime connects at execution.

```
your MCP server  ←  Nixet runtime  ←  Nixet API  ←  you
```

Two jobs, and they are separate on purpose:

- **Registering** a server says where your tools are and how to authenticate.
- **Policy** says what an agent may do with each tool. That is on the version.

## The thing to get right

A tool carries `tags` and a `default_policy`. They look similar and are not the
same kind of thing.

A **tag** describes what a tool does. Where the server published MCP
annotations it is the server's own claim about itself; where it did not, it is
Nixet's reading of the name. `tag_source` says which. Either way **it is a
claim, not a guarantee.** The MCP specification is explicit:

> An untrusted server can lie. A server can claim `readOnlyHint: true` and
> delete your files anyway.

A **policy** is what Nixet actually does. You decide it, it freezes into the
version, and it is enforced before a tool is offered to the model.

So: tags drive what a customer is *shown* and which default applies. Policy is
what *holds*. Never tell a user a tool is safe because it is tagged `read`.

## Registering a server

Store the credential first. It is written once, referenced by name, and no
endpoint returns it:

```ts
const secret = await nixet.secrets.create({
  name: "github-token",
  value: process.env.GH_PAT,
});

const server = await nixet.mcpServers.create({
  name: "github",                  // the handle a version pins; fixed
  url: "https://mcp.example.com/mcp",
  transport: "http",
  auth: { type: "bearer", secret: secret.name },
});

server.tool_count        // discovered now, not at run time
server.last_error        // why we could not reach it, when we could not
```

Remote only. `stdio` would mean spawning your process inside our runtime from
arguments you supplied, so that transport does not exist rather than being
refused later.

**Registration succeeds even if the server is unreachable.** Being down is a
fact about the server, recorded against it, not a reason to refuse a
configuration someone may still be finishing. Check `last_error` — do not
assume a 200 means we reached it.

## Seeing what it offers

Discovery runs at registration, so you find out now rather than when an agent
fails:

```ts
const tools = await nixet.tools.list({ serverName: "github" });

for (const tool of tools.data) {
  console.log(tool.name, tool.tags, tool.tag_source, tool.default_policy);
}
```

Real output, against `mcp.deepwiki.com/mcp`:

```
ask_question           ["write"]   inferred → allow
read_wiki_contents     ["read"]    inferred → allow
read_wiki_structure    ["read"]    inferred → allow
```

Note `ask_question` is tagged `write`. It only reads, but no read verb matches
its name and an unrecognised verb is treated as a write — unknown is closer to
"changes something" than to "changes nothing". That is the inference being
conservative, and it is exactly the case a policy is for.

## Setting policy

Only the exceptions. Anything unnamed takes the default its tags imply, so this
does not need rewriting when the server adds a tool:

```ts
await nixet.agents.versions.create(agent.id, {
  instructions: "Answer questions about the repository.",
  mcpServers: ["github"],
  toolPolicies: { "github.delete_repo": "deny" },
});
```

Qualified by server, because two servers can both offer `search` and a policy
that silently applied to both would grant access nobody asked for.

Where each half lives matters, and they are not in the same place:

| | lives on | changes when |
| --- | --- | --- |
| tags, `default_policy` | the tool, per server | the server is re-discovered |
| `tool_policies` | the agent version | you publish a new version |

So a tool's tags can be corrected without republishing every agent that uses
it, while what a *particular* agent may do is frozen into its version — which
is what lets a past run be explained by the policy it recorded.

### Defaults

| tag | default | |
| --- | --- | --- |
| `read` | `allow` | |
| `write` | `allow` | becomes `ask` once approvals exist |
| `destructive` | `ask` | so it is refused at publish today |
| `external` | `allow` | |

Strictest tag wins: a tool tagged `read` and `destructive` is destructive. A
thing that reads and deletes is a thing that deletes.

## `ask` does not work yet — say so

Nothing can pause a run for a human. `ask` is **refused at publish**, not
stored and ignored:

```
These tools would need a human's approval, which Nixet cannot yet ask for:
github.delete_repo (tagged destructive). Set each to `allow` or `deny` in
`tool_policies` until approvals exist.
```

The `(tagged destructive)` suffix appears when nobody typed `ask` — it names
where the policy came from. An explicit override is printed without it.

Refusing is deliberate. Treating `ask` as `allow` would run the tool the
customer wanted stopped; as `deny`, it would produce an agent that
mysteriously cannot do its job. A version that cannot mean what it says should
not become runnable.

**This catches two routes, and the second surprises people.** An explicit
`"ask"` is obvious. But a tool tagged `destructive` reaches `ask` through its
tag default without anyone typing it — so a version naming a server that has
any destructive tool will refuse to publish until that tool is given an
explicit `allow` or `deny`. The error names the tool and says where the policy
came from.

## Failure modes

| What you see | What it means |
| --- | --- |
| `tool_count: 0` and `last_error` set | Registered, never reached. Wrong URL, rejected token, or server down |
| Publish refused, "would need a human's approval" | A tool is `ask`, explicitly or through the `destructive` default |
| Publish refused, "not found on the servers" | A policy names a tool that does not exist — often a typo, which would otherwise silently forbid nothing |
| Publish refused, "servers this version does not use" | The policy's server prefix is not in `mcpServers` |
| Publish refused, MCP and redaction | Cannot combine: a masked run hands tools `[GIVEN_NAME_1]` where a value was |
| Agent never calls the tool | Check the policy resolved to `allow`, then check the trace for a tool event |
| `Unrecognized key: "allowed_tools"` | Removed. Use `toolPolicies` on the version |

## A server cannot widen its own access

Policy is applied against the tools on record, discovered at registration. A
tool the server started offering afterwards is not on record, so it is not
offered to the model. Adding a tool cannot expand what a published version may
do.

Discovery re-runs when you change the server's `url` **or its `auth`** — the
tools on record were read from somewhere we no longer point, or through a token
we no longer send. That is the deliberate way to pick up new tools, and it is
also how you recover a server that registered with `last_error` because its
credential was wrong: store the corrected secret, then update `auth`.

## When asked whether this is secure

Be exact:

- Policy is enforced **before** a tool is offered to the model, on the Nixet
  side. The runtime receives a resolved list, not rules to apply.
- A lying server cannot lower its own policy. Its annotations only ever choose
  a *default*, and only where the customer named nothing.
- What Nixet cannot do is stop a tool doing something other than what it says.
  If `get_user` deletes a row, `deny` is the only protection — a tag is not one.
