---
title: Deploy with Alchemy
description: One alchemy.run.ts provisions the Worker, the Durable Objects, and the bucket — locally under miniflare, then on real Cloudflare.
---

Ripple deploys with [Alchemy](https://alchemy.run), the Effect-native
infrastructure-as-code tool. The same `alchemy.run.ts` runs locally under
miniflare (`alchemy dev`) and provisions real Cloudflare resources
(`alchemy deploy`).

## The stack

```ts
import * as Ripple from "@ripplegraph/alchemy";
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
  main: "./packages/worker/src/index.ts",
  compatibility: { date: "2025-06-01", flags: ["nodejs_compat"] },
  env: { STORE: Store, TRANSACTOR: Transactor, REPLICA: Replica },
});

export const Server = Ripple.Server("Ripple", { worker: Worker });
export const TodosDb = Ripple.Database("todos", {
  server: Server,
  catalog: Todos,
});

export default Alchemy.Stack(
  "my-app",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Ripple.providers()),
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

## The Ripple resources

**`Ripple.Server`** wraps the peer Worker. Nothing is provisioned and no
database name is pinned: what the resource buys is the deployment — the
resolved `url`, the shared bearer `token`, and a deploy-time proof that the
server is actually serving (`GET /health`) before anything binds to it.

**`Ripple.Database`** is not a cloud object — a database is a name — it is
"install this catalog on that name", ordered after the server it names. A
redeploy costs one no-op transaction. Per-tenant names call `db.install()` at
tenant creation instead.

## Commands

```sh
bun alchemy dev                 # local stack (miniflare emulates R2 + both DOs)
bun alchemy deploy              # deploy the $USER stage
bun alchemy deploy --stage prod # production
bun alchemy destroy             # tear a stage down
```

Stages are isolated copies of the stack. `$USER` gives every developer their
own; CI can mint ephemeral stages (the repository's e2e suite deploys
`e2e-<epoch>-<rand>` and destroys it after the run).

## Credentials

| name | purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Workers Scripts Write (covers DOs), Workers R2 Storage Write, Account Settings Read |
| `CLOUDFLARE_ACCOUNT_ID` | the account to deploy into |

Local dev needs neither for real: `ALCHEMY_STATE=local` with any 32-hex
placeholder account id and `CLOUDFLARE_API_TOKEN=x` keeps everything in
miniflare.

## Auth at deploy

The peer is open until you say otherwise. Set `RIPPLE_TOKEN` for one shared
bearer token, or compile a policy into the Worker's env for JWT-verified,
per-request filtered access:

```ts
const auth: Ripple.PeerAuth = {
  policy: process.env.RIPPLE_POLICY,
  jwksUrl: process.env.RIPPLE_JWKS_URL,
  issuers: process.env.RIPPLE_JWT_ISS,
  aud: process.env.RIPPLE_JWT_AUD,
};

const Worker = Cloudflare.Worker("Peer", {
  // …
  env: { /* … */ ...Ripple.authEnv(auth) },
});

export const Server = Ripple.Server("Ripple", { worker: Worker, auth });
```

See [Auth and policy](/guides/auth/) for what the policy enforces, and the
[configuration reference](/reference/configuration/) for every knob.
