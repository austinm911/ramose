/**
 * An app Worker that uses the database declared in `resources.ts`.
 *
 * This lives in its own module for a reason: `main: import.meta.url` makes the
 * Worker its own bundle entrypoint, and alchemy's virtual entry does
 * `import entrypoint from <main>` — so whatever this module (transitively)
 * imports ends up inside the deployed Worker. Under alchemy 2.0.0-beta.72,
 * having `Alchemy.Stack(…, { providers: Cloudflare.providers() })` in that
 * graph bundles the engine and workerd fails at startup with
 * `TypeError: t.resolve is not a function`. Keeping the declaration here and
 * the stack next door avoids it; alchemy accepts a Worker declaration as a
 * module's default export (see alchemy/src/Runtime.ts).
 */

import * as Ripple from "@ripple/alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { Movies } from "./resources.ts";

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

        // Entity ids are assigned by the transactor, so ask the index for one
        // rather than guessing: the same query, projected on `?e`.
        const eids = yield* db.q<number[][]>(
          { find: ["?e"], where: [["?e", ":user/name", "?n"]] },
          [],
          { minT: ack.t },
        );
        const ada = eids.length === 0 ? undefined : yield* db.entity(eids[0][0]);

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

export default App;
