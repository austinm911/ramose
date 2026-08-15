/**
 * Ripple infrastructure — Alchemy (Effect-based API, alchemy 2.x).
 *
 * One Worker (the peer; it also exports both Durable Object classes —
 * single-script pattern), two SQLite-backed Durable Object namespaces, one R2
 * bucket bound to the Worker and therefore reachable from both DO classes.
 *
 * The Worker is an *async* Worker (plain `export default { fetch }` +
 * `export { TransactorDO, QueryReplicaDO }` from the entrypoint); bindings
 * are declared with `env` and typed via `Cloudflare.InferEnv`. New Durable
 * Object classes are created SQLite-backed by Alchemy.
 *
 *   bun alchemy dev                 # local dev (miniflare emulates R2 + DOs)
 *   bun alchemy deploy              # deploy to the current stage (default: $USER)
 *   bun alchemy deploy --stage prod
 *   bun alchemy destroy
 *
 * Verified against https://alchemy.run/llms.txt, /cloudflare/compute/workers
 * and /cloudflare/compute/durable-objects for alchemy 2.0.0-beta.72.
 */

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

const stage = process.env.ALCHEMY_STAGE ?? process.env.STAGE ?? process.env.USER ?? "dev";

/** Content-addressed segment / log / root storage. Everything except `root/current` is immutable. */
export const Store = Cloudflare.R2.Bucket("Store");

/** One Transactor per logical database (single writer); N QueryReplicas per database. */
export const Transactor = Cloudflare.DurableObject("TransactorDO", { className: "TransactorDO" });
export const Replica = Cloudflare.DurableObject("QueryReplicaDO", { className: "QueryReplicaDO" });

export const Worker = Cloudflare.Worker("Worker", {
  main: "./packages/worker/src/index.ts",
  compatibility: { date: "2025-06-01", flags: ["nodejs_compat"] },
  env: {
    STORE: Store,
    TRANSACTOR: Transactor,
    REPLICA: Replica,
    RIPPLE_STAGE: stage,
    // RIPPLE_TOKENS: Config.redacted("RIPPLE_TOKENS")  ← per-db bearer tokens for prod
  },
});

/** Typed `env` for the Worker entrypoint (mirrors packages/transactor/src/env.ts#RippleEnv). */
export type WorkerEnv = Cloudflare.InferEnv<typeof Worker>;

export default Alchemy.Stack(
  "ripple",
  {
    providers: Cloudflare.providers(),
    // State lives in Cloudflare by default; ALCHEMY_STATE=local keeps a file
    // store instead (offline `bun alchemy dev` against the local emulation).
    state: process.env.ALCHEMY_STATE === "local" ? Alchemy.localState() : Cloudflare.state(),
  },
  Effect.gen(function* () {
    const worker = yield* Worker;
    return { url: worker.url };
  }),
);
