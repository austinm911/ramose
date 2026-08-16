/**
 * Ripple through the Alchemy 2 + Effect interface, in the shape the KV docs
 * use: declare the deployment as a resource, bind it as a capability, use the
 * Effect-native client.
 *
 * The resource is the *peer* (a Ripple system). A database is a *name* on it —
 * nothing is provisioned, so there is no resource per database: you `create`
 * (≡ `connect`) a name with a catalog and the typed wrap ensures it.
 *
 * This directory is a *type-checked* example, not part of the deployed stack —
 * it is compiled by `bun run typecheck` so the public API can never drift from
 * the documentation, and it runs as-is under
 * `bun alchemy dev examples/kv-style/alchemy.run.ts`. To adopt it, copy the
 * four files into a project of your own.
 *
 *   resources.ts    ← you are here: the Ripple deployment (peer + system)
 *   schema.ts       shared catalog (User / Movies)
 *   app.ts          an app Worker that binds the system (its own module, so
 *                   `main: import.meta.url` bundles only the app)
 *   alchemy.run.ts  the stack: providers, the deploy-time schema Action, outputs
 *
 * The split is not cosmetic: under alchemy 2.0.0-beta.72 a self-referential
 * `main: import.meta.url` in the same module as `Alchemy.Stack(…, { providers })`
 * pulls the engine into the Worker bundle and workerd dies with
 * `TypeError: t.resolve is not a function` (reproducible with zero Ripple code),
 * so the Worker declaration lives in its own file and is imported by the stack.
 */

import * as Ripple from "@ripple/alchemy";
import * as Cloudflare from "alchemy/Cloudflare";

// ── the Ripple deployment ──────────────────────────────────────────────────
//
// The peer Worker is an *async* Worker: its entrypoint also re-exports both
// Durable Object classes (single-script pattern), so its bindings are declared
// with `env`, not with the Effect form.

const Store = Cloudflare.R2.Bucket("Store");
const Transactor = Cloudflare.DurableObject("TransactorDO", { className: "TransactorDO" });
const Replica = Cloudflare.DurableObject("QueryReplicaDO", { className: "QueryReplicaDO" });

export const Peer = Cloudflare.Worker("Peer", {
  main: "./packages/worker/src/index.ts",
  compatibility: { date: "2025-06-01", flags: ["nodejs_compat"] },
  env: { STORE: Store, TRANSACTOR: Transactor, REPLICA: Replica },
});

/**
 * The Ripple system on that peer. Nothing is provisioned and no database name
 * is pinned here — the resource is the deployment: it resolves the peer's
 * `url`, carries the shared `token`, and proves the peer answers `/health`
 * before anything downstream binds to it.
 *
 * Databases come later and per use: wrap the bound system
 * (`SchemaFx.fromReadWrite`) and `create("movies", Movies)` hands back a
 * typed client for `/db/movies/…` and ensures the catalog (a schema tx).
 * The untyped `create("movies")` is still the zero-network name upsert.
 * The Transactor DO is `idFromName("movies")`.
 */
export const Sys = Ripple.System("Sys", { peer: Peer });
