---
title: Deploy with Alchemy
description: One alchemy.run.ts provisions the Worker, the Durable Objects, and the bucket — locally under miniflare, then on real Cloudflare.
---

Ramose deploys with [Alchemy](https://alchemy.run), the Effect-native
infrastructure-as-code tool. The same `alchemy.run.ts` runs locally under
miniflare (`alchemy dev`) and provisions real Cloudflare resources
(`alchemy deploy`).

## The stack

```ts
import * as Ramose from "@ramose/alchemy";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Todos } from "./schema.ts";

const Store = Cloudflare.R2.Bucket("Store");
const Transactor = Cloudflare.DurableObject("TransactorDO", {
  className: "TransactorDO",
});
const Replica = Cloudflare.DurableObject("QueryReplicaDO", {
  className: "QueryReplicaDO",
});

const Worker = Cloudflare.Worker("Peer", {
  main: "@ramose/worker",
  compatibility: { date: "2025-06-01", flags: ["nodejs_compat"] },
  env: { STORE: Store, TRANSACTOR: Transactor, REPLICA: Replica },
});

export const Server = Ramose.Server("Ramose", { worker: Worker });
export const TodosDb = Ramose.Database("todos", {
  server: Server,
  catalog: Todos,
});

export default Alchemy.Stack(
  "my-app",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Ramose.providers()),
    state: process.env.ALCHEMY_STATE === "local"
      ? Alchemy.localState()
      : Cloudflare.state(),
  },
  Effect.gen(function* () {
    const server = yield* Server;
    yield* TodosDb;
    return { peerUrl: server.url };
  }),
);
```

## The Ramose resources

**`Ramose.Server`** wraps the peer Worker. Nothing is provisioned and no
database name is pinned: what the resource buys is the deployment — the
resolved `url`, the shared bearer `token`, and a deploy-time proof that the
server is actually serving (`GET /health`) before anything binds to it.

**`Ramose.Database`** is not a cloud object — a database is a name — it is
"install this catalog on that name", ordered after the server it names. A
redeploy costs one no-op transaction. Per-tenant names call `db.install()` at
tenant creation instead.

## Commands

```sh
npx alchemy dev                 # local stack (miniflare emulates R2 + both DOs)
npx alchemy deploy              # deploy the $USER stage
npx alchemy deploy --stage prod # production
npx alchemy destroy             # tear a stage down
```

`bun alchemy` is the same CLI. Stages are isolated copies of the stack.
`$USER` gives every developer their own; CI can mint ephemeral stages.

## Credentials

| name | purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Workers Scripts Write (covers DOs), Workers R2 Storage Write, Account Settings Read |
| `CLOUDFLARE_ACCOUNT_ID` | the account to deploy into |

Local dev needs neither for real: `ALCHEMY_STATE=local` with any 32-hex
placeholder account id and `CLOUDFLARE_API_TOKEN=x` keeps everything in
miniflare.

## Auth at deploy

:::caution[A new peer is open to everyone]
Until you configure one, there is no authentication: every caller has full
rights on every database. Set a policy before you point real users at a
deployed peer, and walk the [Before production
checklist](/guides/before-production/) first.
:::

Set `RAMOSE_TOKEN` for one shared bearer token, or compile a policy into the
Worker's environment for JWT-verified, per-request filtered access:

```ts title="alchemy.run.ts"
const auth: Ramose.PeerAuth = {
  policy: process.env.RAMOSE_POLICY, // Ramose.Policy.compile(policy, { pulls })
  jwksUrl: process.env.RAMOSE_JWKS_URL,
  issuers: process.env.RAMOSE_JWT_ISS,
  aud: process.env.RAMOSE_JWT_AUD,
  allowedOrigins: process.env.RAMOSE_ALLOWED_ORIGINS,
};

const Worker = Cloudflare.Worker("Peer", {
  // …
  env: { /* … */ ...Ramose.authEnv(auth) },
});

export const Server = Ramose.Server("Ramose", { worker: Worker, auth });
```

Passing `auth` to `Ramose.Server` buys a deploy-time check: a policy with no
`jwksUrl`, `issuers`, or `aud` fails the deploy instead of denying every
request at runtime.

## Tearing down

`npx alchemy destroy` removes the Worker and the resource records. It does
**not** delete your data: `Ramose.Database` and `Ramose.Server` deliberately
delete nothing, so a forgotten resource never erases a database. The bucket and
the Durable Object namespaces stay behind — and stay billable — until you
remove them yourself.

See [Permissions in 10 minutes](/guides/permissions/) to write your first
policy, [Auth and policy](/guides/auth/) for what it enforces, and the
[configuration reference](/reference/configuration/) for every variable.
