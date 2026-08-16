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

import * as Ripple from "@ripple/alchemy";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

const stage = process.env.ALCHEMY_STAGE ?? process.env.STAGE ?? process.env.USER ?? "dev";
const tuning = (...names: string[]): Record<string, string> =>
  Object.fromEntries(names.filter((n) => process.env[n] !== undefined).map((n) => [n, process.env[n]!]));

/** Content-addressed segment / log / root storage. Everything except `root/current` is immutable. */
export const Store = Cloudflare.R2.Bucket("Store");

/**
 * Workers Analytics Engine dataset for tx/http telemetry (`env.ANALYTICS`).
 *
 * Declared with the `env` form rather than the doc's two-phase Effect form
 * (`Cloudflare.Worker(name, props, Effect.gen(… WriteDataset(Analytics) …))`):
 * that form binds under the *dataset resource's* logical id and expects the
 * Worker body to be authored inline (`main: import.meta.url`, handlers
 * returned from the generator). This Worker is a plain async Worker whose
 * script also re-exports both Durable Object classes (single-script pattern,
 * packages/worker/src/index.ts), so the DOs would lose their env. The `env`
 * form emits the same binding — `{ type: "analytics_engine", name: "ANALYTICS",
 * dataset: "ripple_tx" }` (alchemy/src/Cloudflare/Workers/WorkerAsyncBindings.ts
 * `isDataset` arm) — under the name we choose, so the Worker *and* both DOs see
 * `env.ANALYTICS.writeDataPoint`. The Effect-shaped client lives in the Worker
 * instead (packages/worker/src/analytics.ts).
 */
export const Analytics = Cloudflare.AnalyticsEngine.Dataset("Analytics", { dataset: "ripple_tx" });

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
    ANALYTICS: Analytics,
    RIPPLE_STAGE: stage,
    // tuning knobs (see packages/transactor/src/env.ts); only bound when set
    ...tuning("RIPPLE_MAX_BATCH", "RIPPLE_QUERY_MAX_CELLS", "RIPPLE_LOG_LEVEL", "RIPPLE_INDEX_TX_THRESHOLD", "RIPPLE_INDEX_INTERVAL_MS", "RIPPLE_LOG_KEEP_TXS", "RIPPLE_REPLICA_HINT", "RIPPLE_CACHE_BASIS", "RIPPLE_CACHE_MODE", "RIPPLE_TIMING_YIELDS"),
    // RIPPLE_TOKENS: Config.redacted("RIPPLE_TOKENS")  ← per-db bearer tokens for prod
  },
});

/** Typed `env` for the Worker entrypoint (mirrors packages/transactor/src/env.ts#RippleEnv). */
export type WorkerEnv = Cloudflare.InferEnv<typeof Worker>;

/**
 * A logical Ripple database on this peer (`@ripple/alchemy`).
 *
 * Nothing is provisioned: the Transactor DO is `idFromName("movies")` and the
 * log/segments live under `db/movies/…` in the bucket, so the first
 * transaction materializes it. What the resource buys is a *pinned* name that
 * other stacks and Workers can depend on, plus a deploy-time proof that the
 * peer is actually serving (`GET /health`) before anything binds to it.
 *
 * Consumers get an Effect-native client — `yield* Ripple.ReadWriteDatabase(Movies)`
 * — over a Worker service binding to this peer, plain HTTPS, or an Action.
 * See examples/kv-style/ (resources.ts + app.ts + alchemy.run.ts).
 *
 * Note the same async-env limitation as `Analytics` above: a custom resource
 * cannot be declared in a Worker's `env: {}` (the classifier chain in
 * alchemy/src/Cloudflare/Workers/WorkerAsyncBindings.ts is closed over
 * Cloudflare's own resource types). Attribute Outputs still work —
 * `env: { MOVIES_URL: Movies.databaseUrl }` lowers to a `plain_text`
 * binding — and the `Ripple.*Database*` capabilities bind themselves.
 */
export const Movies = Ripple.Database("Movies", { peer: Worker, name: "movies" });

export default Alchemy.Stack(
  "ripple",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Ripple.providers()),
    // State lives in Cloudflare by default; ALCHEMY_STATE=local keeps a file
    // store instead (offline `bun alchemy dev` against the local emulation).
    state: process.env.ALCHEMY_STATE === "local" ? Alchemy.localState() : Cloudflare.state(),
  },
  Effect.gen(function* () {
    const worker = yield* Worker;
    const movies = yield* Movies;
    return { url: worker.url, databaseUrl: movies.databaseUrl };
  }),
);
