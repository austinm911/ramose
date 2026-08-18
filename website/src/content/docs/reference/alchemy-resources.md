---
title: Alchemy resources
description: What @ripplegraph/alchemy adds on top of the portable client — the Server and Database resources, capabilities, and transports.
---

`@ripplegraph/alchemy` re-exports all of [`@ripplegraph/alchemy/db`](/reference/client-api/)
and adds the deploy-time names. Import it as `* as Ripple`.

| name | signature |
| --- | --- |
| `Server` | `(id: string, props: { worker: Cloudflare.Worker; url?: string; token?: Secret; auth?: PeerAuth }) => Server` — outputs `{ url, workerName }` |
| `Database` | `(id: string, props: { server: Server; catalog: C; name?: string }) => Database` — installs the catalog at deploy |
| `ReadWriteDatabases` | `(server: Server) => Effect<Databases, never, Providers>` — the binding **is** the client |
| `ReadDatabases` | the same client with the writes removed |
| `ServerBinding` | `Layer<Providers>` — Worker service binding transport |
| `ServerHttp` | `Layer<Providers>` — public URL transport; also `alchemy dev` and deploy-time actions |
| `providers` | `() => Layer<Providers>` — merge into your stack's providers |
| `Providers` | the resource-provider service |
| `PeerAuth` / `authEnv` / `internalSecret` | auth config for the peer Worker's env — see [Auth and policy](/guides/auth/) |

## `Ripple.Server`

Wraps the peer Worker. Nothing is provisioned and no database name is pinned —
a Ripple database is a name, so the first transaction materializes it. The
resource buys the deployment:

- the resolved `url` of the peer,
- the shared bearer `token` (when one is configured),
- a deploy-time proof that the server is actually serving (`GET /health`)
  before anything binds to it.

```ts
export const Server = Ripple.Server("Ripple", { worker: Worker, auth });
```

## `Ripple.Database`

"Install this catalog on that name", ordered after the server it names.
`db.install()` is an ordinary idempotent transaction, so a redeploy costs one
no-op tx. Use it for databases known at deploy time; per-tenant names call
`db.install()` at tenant creation instead.

```ts
export const TodosDb = Ripple.Database("todos", {
  server: Server,
  catalog: Todos,
});
```

## Capabilities and transports

Privilege is the capability you bind; the transport is a Layer:

```ts
const ripple = yield* Ripple.ReadWriteDatabases(Server);
// …
Effect.provide(Ripple.ServerBinding); // or Ripple.ServerHttp
```

The Worker body is identical under either transport. See
[Workers and tenants](/guides/workers/) for the full pattern.

## Stack wiring

Merge Ripple's providers next to Cloudflare's:

```ts
export default Alchemy.Stack(
  "my-app",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Ripple.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const server = yield* Server;
    yield* TodosDb;
    return { peerUrl: server.url };
  }),
);
```
