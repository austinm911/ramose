---
title: A database is a name
description: No create step, no provisioning — ramose.db(name, catalog) is the whole story, and db-per-tenant is a function call.
---

Ramose has no create-database call, no list, no delete. A database *is* a
name: the Transactor DO is `idFromName(name)`, the log and segments live under
`db/<name>/…` in the bucket, and the first transaction against a name
materializes it.

```ts
const db = ramose.db("acme", Catalog); // pure — zero network
```

## What that buys you

- **Db-per-tenant is a function call.** One deployed peer serves every name.
  An app Worker resolves the tenant from the request and calls
  `ramose.db(tenantOf(request), Catalog)` — pure, per request, no provisioning
  service in the middle.
- **No fleet to manage.** There is one resource (the peer), not one resource
  per tenant. Tenant count is a namespace, not an ops problem.
- **Isolation by construction.** Every name gets its own single writer and its
  own key prefix in R2. A GC sweep or an admin action on one database can
  never touch another.

## Installing a catalog

`ramose.db(name, catalog)` is pure, so something must put the schema on the
peer before the first real read or write. There are two doors, both explicit:

**At deploy** — for databases you know about statically:

```ts
export const TodosDb = Ramose.Database("todos", {
  server: Server,
  catalog: Todos,
});
```

**At tenant creation** — for names minted at runtime:

```ts
const db = ramose.db(`tenant-${key}`, Catalog);
yield* db.install(); // idempotent catalog upsert — one no-op tx when unchanged
```

Install is explicit and once. A browser never installs schema, and a Worker
binding does zero network per request. Against an *uninstalled* database, `q`
fails with `InvalidRequest` and `transact` fails with `TxRejected`.

## What counts as a name

A name must match `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$` — alphanumeric first
character, then up to 63 more of `[a-zA-Z0-9._-]`. The client exports the rule
from `@ramose/alchemy/db` as `DATABASE_NAME_RE` and `isDatabaseName(name)`, so
an app that lets users mint names (a "create workspace" flow) can validate
before the peer does; a bad name fails the first operation with
`InvalidRequest` without reaching the peer.

## Names and tokens

With a shared `RAMOSE_TOKEN`, one bearer token opens every name — fine for a
service tier that is itself the authority. Under a `RAMOSE_POLICY`, a JWT is
bound to exactly one database by its `ramose.db` claim, so a token cannot
wander across tenants. See [Auth and policy](/guides/auth/).

## The one limit

One name, one writer, low thousands of transactions per second. A tenant that
needs more must be split into several logical databases along write-ownership
lines — see [the runbook](/reference/runbook/#the-write-ceiling). There are no
cross-database joins; that is the price of the split.
