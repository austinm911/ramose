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
import { Movies } from "./schema.ts";

// ── schema install as a deploy-time Action ─────────────────────────────────
//
// Actions run in the engine's process, after their upstreams are applied, so
// they use the `*Local` layer: no host Worker, no service binding — just the
// peer's freshly-deployed URL (the local workerd dev server's, under
// `alchemy dev`).
//
// `ripple.db("movies", Movies)` is pure — naming a database costs no request —
// and `install()` is the one place the catalog lands: an ordinary, idempotent
// transaction. It has to run in the apply fn (the peer is not up at plan time).

export const InstallSchema = Alchemy.Action(
  "InstallSchema",
  Effect.gen(function* () {
    const ripple = yield* Ripple.WriteSystem(Sys);
    return Effect.fn(function* () {
      yield* ripple.db("movies", Movies).install();
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
    yield* InstallSchema({});
    return {
      url: app.url,
      peerUrl: sys.url,
    };
  }),
);
