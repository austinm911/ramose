/**
 * Ripple through the Alchemy 2 + Effect interface, in the shape the KV docs
 * use: declare the database as a resource, bind it as a capability, use the
 * Effect-native client.
 *
 * This file is a *type-checked* example, not part of the deployed stack — it
 * is compiled by `bun run typecheck` so the public API can never drift from
 * the documentation. To actually run it, rename it `alchemy.run.ts` in a
 * project of your own (or copy the pieces you want into yours).
 */

import * as Ripple from "@ripple/alchemy";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

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
 * A logical database on that peer. Nothing is provisioned — the name *is* the
 * database — but the resource pins it, derives `databaseUrl`, and proves the
 * peer answers `/health` before anything downstream binds to it.
 */
export const Movies = Ripple.Database("Movies", { peer: Peer, name: "movies" });

// ── an app Worker that uses it ─────────────────────────────────────────────
//
// The Effect form: the outer generator runs at deploy time (it lowers a
// `service` binding to the peer, plus the database name as an env value); the
// handler runs per request against `env.Movies.fetch` — same colo, no public
// hop, no TLS handshake.

export const App = Cloudflare.Worker(
  "App",
  { main: import.meta.url },
  Effect.gen(function* () {
    const db = yield* Ripple.ReadWriteDatabase(Movies);

    return {
      fetch: Effect.gen(function* () {
        const ack = yield* db.transact([{ ":user/name": "Ada" }]);

        // Read your own write: `minT` fences the read against the `t` we just
        // got back, so a replica that has not caught up refetches its basis.
        const names = yield* db.q<string[][]>(
          { find: ["?n"], where: [["?e", ":user/name", "?n"]] },
          [],
          { minT: ack.t },
        );

        // ...and the same query as of a past transaction.
        const before = yield* db.asOf(ack.t - 1).q<string[][]>({
          find: ["?n"],
          where: [["?e", ":user/name", "?n"]],
        });

        const ada = yield* db.entity(17);

        return yield* HttpServerResponse.json({ t: ack.t, names, before, ada });
      }).pipe(
        // The client's failures are tagged, so the HTTP mapping is a total
        // match rather than status-code sniffing.
        Effect.catchTags({
          TxRejected: (e) =>
            HttpServerResponse.json({ error: e.message, code: e.code }, { status: 409 }),
          TransactorDead: (e) =>
            HttpServerResponse.json(
              { error: e.message },
              { status: 503, headers: { "retry-after": String(Math.ceil(e.retryAfterMs / 1000)) } },
            ),
          QueryBudgetExceeded: (e) =>
            HttpServerResponse.json({ error: e.message, clause: e.clause }, { status: 413 }),
          BadRequest: (e) => HttpServerResponse.json({ error: e.message }, { status: 400 }),
          Unauthorized: (e) => HttpServerResponse.json({ error: e.message }, { status: 401 }),
          NotFound: (e) => HttpServerResponse.json({ error: e.message }, { status: 404 }),
          Internal: (e) => HttpServerResponse.json({ error: e.message }, { status: 500 }),
          NetworkError: (e) => HttpServerResponse.json({ error: e.message }, { status: 502 }),
        }),
      ),
    };
  }).pipe(Effect.provide(Ripple.ReadWriteDatabaseBinding)),
);

// ── schema install as a deploy-time Action ─────────────────────────────────
//
// Actions run in the engine's process, after their upstreams are applied, so
// they use the `*Local` layer: no host Worker, no service binding — just the
// peer's freshly-deployed URL (the local workerd dev server's, under
// `alchemy dev`).

export const InstallSchema = Alchemy.Action(
  "InstallSchema",
  Effect.gen(function* () {
    const db = yield* Ripple.WriteDatabase(Movies);
    return Effect.fn(function* () {
      const ack = yield* db.transact([
        {
          ":db/ident": ":user/name",
          ":db/valueType": ":db.type/string",
          ":db/cardinality": ":db.cardinality/one",
        },
      ]);
      return { t: ack.t };
    });
  }).pipe(Effect.provide(Ripple.WriteDatabaseLocal)),
);

// ── the stack ──────────────────────────────────────────────────────────────

export default Alchemy.Stack(
  "ripple-example",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Ripple.providers()),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const movies = yield* Movies;
    const app = yield* App;
    const schema = yield* InstallSchema({});
    return {
      url: app.url,
      databaseUrl: movies.databaseUrl,
      schemaT: schema.t,
    };
  }),
);
