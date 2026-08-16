/**
 * The stack: providers, a deploy-time schema install, outputs.
 *
 * Run it with `bun alchemy dev examples/kv-style/alchemy.run.ts` (from the repo
 * root — `Peer`'s `main` is repo-relative), then curl the `url` output.
 *
 * Everything that touches the engine (`Alchemy.Stack`, `Cloudflare.providers()`)
 * stays in this file; the Worker that bundles itself with
 * `main: import.meta.url` lives in `app.ts`. See the note there for the
 * alchemy 2.0.0-beta.72 bundling issue that forces the split.
 */

import * as Ripple from "@ripple/alchemy";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { App } from "./app.ts";
import { Sys } from "./resources.ts";

// ── schema install as a deploy-time Action ─────────────────────────────────
//
// Actions run in the engine's process, after their upstreams are applied, so
// they use the `*Local` layer: no host Worker, no service binding — just the
// peer's freshly-deployed URL (the local workerd dev server's, under
// `alchemy dev`).
//
// `create("movies")` is not a provisioning call: it validates the name and
// returns a client for `/db/movies/…`. It is the transact below that
// materializes the database.

export const InstallSchema = Alchemy.Action(
  "InstallSchema",
  Effect.gen(function* () {
    const system = yield* Ripple.WriteSystem(Sys);
    const movies = yield* system.create("movies");
    return Effect.fn(function* () {
      const ack = yield* movies.transact([
        {
          ":db/ident": ":user/name",
          ":db/valueType": ":db.type/string",
          ":db/cardinality": ":db.cardinality/one",
        },
      ]);
      return { t: ack.t };
    });
  }).pipe(Effect.provide(Ripple.WriteSystemLocal)),
);

export default Alchemy.Stack(
  "ripple-example",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Ripple.providers()),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const sys = yield* Sys;
    const app = yield* App;
    const schema = yield* InstallSchema({});
    return {
      url: app.url,
      peerUrl: sys.url,
      schemaT: schema.t,
    };
  }),
);
