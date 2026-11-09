---
name: nixet-connections
description: Let each end user connect their own account on a tool server, so an agent acts as that user. Use when the user mentions per-user credentials, each customer's own token, connecting a user's broker/CRM/account, OAuth tokens per user, a run acting on behalf of a user, or per_user auth.
---

# Per-user connections

An MCP server registered with a workspace secret reaches **your** account —
your GitHub, your internal API. That is wrong when every end user links their
own account to the same provider: the URL is the same for all of them and only
the token differs.

So the server is registered once with `per_user` auth, and a **connection**
binds one user to one credential for it. A run that names a user reaches that
user's account.

```ts
await nixet.mcpServers.create({
  name: "broker",
  url: "https://mcp.broker.example.com/mcp",
  auth: { type: "per_user", scheme: "api_key" },
});

await nixet.connections.create({
  userId: user.id,          // a Nixet user, usr_…
  server: "broker",
  value: userSuppliedKey,
});

await nixet.agents.versions.create(agentId, {
  instructions: "Answer questions about the user's portfolio.",
  mcpServers: ["broker"],
});

await nixet.runs.create(agentId, { input: "What do I hold?", userId: user.id });
```

## Why not one server per user

Registering the provider once per user would force one agent version per user,
because a version pins its servers by name. Version history would stop
describing behaviour and become a credential registry. The split keeps each
concern where it belongs:

- **The version** decides which servers and which tools — a capability.
- **The connection** decides whose account — an identity.

## Schemes

`scheme` on the server says how users' credentials are obtained:

| Scheme | Credential | Expiry |
| --- | --- | --- |
| `api_key` | A key the user already has, supplied directly | None |
| `oauth2` | An access token from the provider's consent flow | Yes |
| `session` | A session id returned by a sign-in tool on the server | Yes, nothing to refresh |

**Only `api_key` works today.** `connections.create` accepts a value only for
an `api_key` server. For `oauth2` and `session` servers it is refused with a
`400` saying the connection is "started with authorize" — and that authorize
flow is not available yet, and neither is token refresh. So a provider that
needs a per-user OAuth consent screen cannot be connected through Nixet yet.
Say this plainly rather than suggesting a workaround that stores an OAuth token
as if it were an API key.

An API key that you know expires can carry its expiry:

```ts
await nixet.connections.create({
  userId: user.id,
  server: "broker",
  value: userSuppliedKey,
  expiresAt: "2026-12-01T10:00:00Z",   // trusted when given; Nixet cannot infer it
});
```

## Missing or expired refuses the run

If a run needs a `per_user` server and the named user has no active
connection — none stored, expired, or revoked — **the run is refused** with a
`400` naming each server and why (`has not been connected`, `has an expired
connection`). It never calls the server unauthenticated.

This is deliberate and differs from a workspace secret. Reaching someone's
broker as nobody is worse than a refused run, and nothing outside would reveal
it had happened.

Two ways to avoid the failure:

- Check first: `nixet.connections.list({ userId, server: "broker", status: "active" })`.
- Narrow the run to the servers the user has connected:
  `runs.create(agentId, { input, userId, mcpServers: ["crm"] })`. `mcpServers`
  on a run is a subset of the version's list, never an addition.

A run with no `userId` cannot use a `per_user` server at all.

## Write-only, and revoke rather than delete

```ts
const conn = await nixet.connections.retrieve(connectionId);
conn.value;   // does not exist on any response

await nixet.connections.list({ userId: user.id });
await nixet.connections.revoke(connectionId);
```

A credential is never returned. A read gives the scheme, the status, the expiry
and when it was last used.

`revoke` erases the credential and keeps the row. A run recorded which
connection it authenticated as, and deleting the row would leave that run
unexplainable.

A user has at most one connection per server. Creating a second is refused
with `409`; to replace a credential, revoke the old connection, then create.

## Storage

Each credential is encrypted per row with its own data key, scoped to the
workspace and the connection, the same envelope used for secrets.

## What to check

| Symptom | What it means |
| --- | --- |
| `400` on a run naming a server and a user | No active connection for that user. Create one, or narrow `mcpServers` |
| `400` on a run, "cannot reach this agent's tools" with no user | The run did not pass `userId` |
| Refused although a connection exists | Check `status` and `expires_at`; an expired credential is not refreshed |
| `400` creating, "started with authorize" | The server's scheme is `oauth2` or `session`, which cannot be connected yet |
| `400` creating, "workspace credential" | The server's `auth.type` is not `per_user` |
| `404` creating | No such user or no MCP server by that name |
| `409` creating | The user already has a connection to that server. Revoke it first |
| Agent acted on the wrong account | The run named a different `userId` |
| Looking for the token on a response | Never returned. Store a new one instead |

Full signatures: [api.md](../nixet-sdk/references/api.md#connections).
See `nixet-mcp` for registering servers and tool policy.
