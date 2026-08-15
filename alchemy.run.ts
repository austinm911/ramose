/**
 * Ripple infrastructure (Alchemy, Effect-based API).
 *
 * One Worker (the peer, which also exports both DO classes — single-script
 * pattern), two SQLite-backed Durable Object namespaces, one R2 bucket bound
 * to the Worker and (through the same script) to both DO classes.
 *
 *   bun alchemy dev                 # local dev (miniflare emulates R2 + DOs)
 *   bun alchemy deploy              # deploy to the $USER stage
 *   bun alchemy deploy --stage prod # deploy to prod
 *   bun alchemy destroy
 *
 * ⚠️  VERIFY AGAINST THE LIVE DOCS BEFORE THE FIRST DEPLOY.
 * This file follows the Effect-based Alchemy API as described in the spec
 * (`Alchemy.Stack`, `Cloudflare.Worker`, `Cloudflare.DurableObject`,
 * `Cloudflare.R2Bucket`). The environment this was authored in had no network
 * access, so https://alchemy.run/llms.txt could not be consulted; if the
 * import names or option keys differ, adjust them here — nothing else in the
 * repository depends on the Alchemy API. The legacy (async-resource) shape is
 * kept at the bottom as a fallback for reference.
 */

import { Alchemy } from "alchemy";
import { Cloudflare } from "alchemy/cloudflare";
import { Effect } from "effect";

const stage = process.env.ALCHEMY_STAGE ?? process.env.STAGE ?? process.env.USER ?? "dev";

export default Alchemy.Stack(
  "ripple",
  Effect.gen(function* () {
    // Content-addressed segment/log/root storage. Everything except root/current is immutable.
    const store = yield* Cloudflare.R2Bucket("ripple-store", {
      name: `ripple-store-${stage}`,
      adopt: true,
    });

    // One Transactor per logical database (single writer); N QueryReplicas per database.
    const transactor = Cloudflare.DurableObject("ripple-transactor", {
      className: "TransactorDO",
      sqlite: true,
    });
    const replica = Cloudflare.DurableObject("ripple-replica", {
      className: "QueryReplicaDO",
      sqlite: true,
    });

    const worker = yield* Cloudflare.Worker("ripple", {
      name: `ripple-${stage}`,
      entrypoint: "./packages/worker/src/index.ts",
      compatibilityDate: "2025-06-01",
      compatibilityFlags: ["nodejs_compat"],
      url: true,
      bindings: {
        STORE: store,
        TRANSACTOR: transactor,
        REPLICA: replica,
        RIPPLE_STAGE: stage,
        // RIPPLE_TOKENS: '{"*":"<token>"}'  ← set via `alchemy.secret(...)` / stage env for prod
      },
    });

    yield* Effect.log(`ripple (${stage}) → ${worker.url}`);
    return { url: worker.url, bucket: store.name };
  }),
);

/*
// Legacy async-resource style (Alchemy < Effect migration), for reference:
import alchemy from "alchemy";
import { DurableObjectNamespace, R2Bucket, Worker } from "alchemy/cloudflare";
const app = await alchemy("ripple", { stage });
const store = await R2Bucket("ripple-store", { name: `ripple-store-${stage}`, adopt: true });
const worker = await Worker("ripple", {
  name: `ripple-${stage}`,
  entrypoint: "./packages/worker/src/index.ts",
  compatibilityFlags: ["nodejs_compat"],
  url: true,
  bindings: {
    STORE: store,
    TRANSACTOR: DurableObjectNamespace("ripple-transactor", { className: "TransactorDO", sqlite: true }),
    REPLICA: DurableObjectNamespace("ripple-replica", { className: "QueryReplicaDO", sqlite: true }),
    RIPPLE_STAGE: stage,
  },
});
console.log(worker.url);
await app.finalize();
*/
