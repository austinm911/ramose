/**
 * The Ripple deployment: the peer Worker and the system on it.
 *
 * Copied from `examples/kv-style/resources.ts` and retargeted at the `todos`
 * database. There is no app Worker here — Vite serves the UI and the browser
 * talks to the peer over the session socket.
 */

import * as Ripple from "@ripple/alchemy";
import * as Cloudflare from "alchemy/Cloudflare";

// The peer Worker is an *async* Worker: its entrypoint re-exports both Durable
// Object classes (single-script pattern), so bindings are declared with `env`.

const Store = Cloudflare.R2.Bucket("Store");
const Transactor = Cloudflare.DurableObject("TransactorDO", { className: "TransactorDO" });
const Replica = Cloudflare.DurableObject("QueryReplicaDO", { className: "QueryReplicaDO" });

export const Peer = Cloudflare.Worker("Peer", {
  main: "./packages/worker/src/index.ts",
  compatibility: { date: "2025-06-01", flags: ["nodejs_compat"] },
  env: { STORE: Store, TRANSACTOR: Transactor, REPLICA: Replica },
});

/** Nothing is provisioned per database — a database is a name on this peer. */
export const Sys = Ripple.System("Sys", { peer: Peer });
