/**
 * An app Worker that uses the Ripple system declared in `resources.ts`.
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
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { Sys } from "./resources.ts";
import { Movies, User } from "./schema.ts";

// The Effect form: the outer generator runs at deploy time (it lowers a
// `service` binding to the peer, plus the shared token); the handler runs per
// request against `env.Sys.fetch` — same colo, no public hop, no TLS
// handshake.

export const App = Cloudflare.Worker(
  "App",
  { main: import.meta.url },
  Effect.gen(function* () {
    // The binding *is* the client. One `Databases`, bound once at init.
    const ripple = yield* Ripple.ReadWriteSystem(Sys);

    // ── databases are names ──────────────────────────────────────────────────
    //
    // `ripple.db(name, Movies)` is pure: it validates nothing over the wire,
    // opens no socket and issues no request. Db-per-tenant is therefore a
    // function call — one per request, no resource, no deploy, no provisioning
    // per tenant. An illegal name fails the first operation with
    // `InvalidRequest`, so it never reaches the peer.
    //
    // The catalog is installed once, at deploy (`InstallSchema` in
    // alchemy.run.ts) or at tenant creation with `db.install()` — never per
    // request. The token is shared across every name: it is the peer's one
    // `RIPPLE_TOKEN`, checked for every tenant database and ignored when the
    // peer has it unset (docs/RUNBOOK.md).
    const tenantRoute = (tenantId: string) =>
      Effect.gen(function* () {
        const tenant = ripple.db(tenantId, Movies);
        // a tenant's first request is also its install: idempotent, one tx
        yield* tenant.install();

        const { t, dbAfter } = yield* tenant.transact(function* (tx) {
          const ada = yield* tx.entity();
          yield* ada.add(User.name, "Ada");
        });
        // `dbAfter` carries the min-`t` floor, so this reads its own write
        const names = yield* dbAfter.q((q) =>
          q.where("?e", User.name, "?n").find("?n"),
        );
        return yield* HttpServerResponse.json({ tenant: tenantId, t, names });
      });

    return {
      fetch: Effect.gen(function* () {
        // `HttpServerRequest.fromWeb` strips the origin, so `url` is already
        // "/path?query". Valid database names are URL-safe by construction, so
        // the raw segment is used as-is: anything percent-encoded (say
        // `/t/bad%2Fname`) simply fails the name check → `InvalidRequest` → 400.
        const request = yield* HttpServerRequest.HttpServerRequest;
        const path = request.url.split("?")[0] ?? "/";
        if (path.startsWith("/t/")) return yield* tenantRoute(path.slice("/t/".length));

        // The default database. `InstallSchema` (alchemy.run.ts) already
        // installed Movies on this name at deploy time.
        const db = ripple.db("movies", Movies);

        const report = yield* db.transact(function* (tx) {
          const ada = yield* tx.entity();
          yield* ada.add(User.name, "Ada");
        });

        // Read your own write: `dbAfter` is the same db floored at `report.t`,
        // so a replica that has not caught up refetches its basis. No `sync`,
        // no second round trip, no public `minT`.
        const names = yield* report.dbAfter.q((q) =>
          q.where("?e", User.name, "?n").find("?n"),
        );

        // …and the same query as of a past transaction. `asOf` is pure.
        const before = yield* db
          .asOf(report.t - 1)
          .q((q) => q.where("?e", User.name, "?n").find("?n"));

        // Entity ids come back as `Eid` data from `find("?e")`; pulling one is
        // `db.pull` — a missing required field is `null`.
        const rows = yield* report.dbAfter.q((q) =>
          q.where("?e", User.name, "?n").find("?e"),
        );
        const ada =
          rows.length === 0
            ? null
            : yield* report.dbAfter.pull(rows[0][0], { name: User.name });

        return yield* HttpServerResponse.json({ t: report.t, names, before, ada });
      }).pipe(
        // The client's failures are tagged, so the HTTP mapping is a total
        // match rather than status-code sniffing.
        Effect.catchTags({
          TxRejected: (e) =>
            HttpServerResponse.json({ error: e.message, code: e.code }, { status: 409 }),
          Unavailable: (e) =>
            HttpServerResponse.json(
              { error: e.message },
              { status: 503, headers: { "retry-after": String(Math.ceil(e.retryAfterMs / 1000)) } },
            ),
          QueryBudgetExceeded: (e) =>
            HttpServerResponse.json({ error: e.message, clause: e.clause }, { status: 413 }),
          InvalidRequest: (e) => HttpServerResponse.json({ error: e.message }, { status: 400 }),
          Unauthorized: (e) => HttpServerResponse.json({ error: e.message }, { status: 401 }),
          DatabaseNotFound: (e) => HttpServerResponse.json({ error: e.message }, { status: 404 }),
          InternalError: (e) => HttpServerResponse.json({ error: e.message }, { status: 500 }),
          NetworkError: (e) => HttpServerResponse.json({ error: e.message }, { status: 502 }),
        }),
      ),
    };
  }).pipe(Effect.provide(Ripple.ReadWriteSystemBinding)),
);

export default App;
