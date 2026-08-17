---
title: Workers and tenants
description: Bind the server, get a Databases client, and make db-per-tenant a per-request function call.
---

An app Worker talks to the peer through a capability, not a URL string. You
declare *what* you can do (`ReadWriteDatabases` or `ReadDatabases`) and
provide *how* it travels (`ServerBinding` or `ServerHttp`) as a Layer — the
Worker body is identical under either.

## The shape

```ts
import * as Ripple from "@ripple/alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { Server } from "./resources.ts";
import { Movies } from "./schema.ts";

export default Cloudflare.Worker("App", { main: import.meta.url },
  Effect.gen(function* () {
    const ripple = yield* Ripple.ReadWriteDatabases(Server); // once, at init
    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const db = ripple.db(tenantOf(request), Movies);     // pure, per request
        const { dbAfter } = yield* db.transact(function* (tx) {
          const movie = yield* tx.entity();
          yield* movie.add(Movie.title, "Arrival");
        });
        const rows = yield* dbAfter.q((q) =>
          q.where("?m", Movie.title, "?t").find("?t"),
        );
        return yield* HttpServerResponse.json(rows);
      }),
    };
  }).pipe(Effect.provide(Ripple.ServerBinding)));
```

`ripple.db(name, catalog)` is pure — zero network per request — so resolving
the tenant from the request *is* the whole multi-tenancy story. See
[A database is a name](/concepts/databases-are-names/).

## Capabilities

| capability | grants |
| --- | --- |
| `Ripple.ReadWriteDatabases(Server)` | `q`, `pull`, `live`, `asOf`, `history`, `transact`, `install` |
| `Ripple.ReadDatabases(Server)` | the same client with the writes removed |

Privilege is the capability you bind. A reporting Worker that binds
`ReadDatabases` cannot write, by type — there is no token to leak that would
change that.

## Transports

| layer | wire |
| --- | --- |
| `Ripple.ServerBinding` | a Worker service binding — no public egress, the peer is not on the internet at all for this hop |
| `Ripple.ServerHttp` | the peer's public URL — also what `alchemy dev` and deploy-time actions use |

Provide one of them; the capability resolves through it. Swapping transports
is a one-line change at the edge of the program.

## Provisioning mistakes are defects

A missing binding or a malformed URL is `Effect.die`, not a `DbError` — every
client signature's requirements channel is `never`, and configuration errors
surface at init rather than as a retryable error on some request.

## New tenants

Mint the name, install the catalog once, then use it like any other database:

```ts
const db = ripple.db(`tenant-${key}`, Movies);
yield* db.install(); // at tenant creation, not per request
```

The full working example is `examples/kv-style/` in the repository —
`resources.ts` + `app.ts` + `alchemy.run.ts`.
