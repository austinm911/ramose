/**
 * The stack: providers, a deploy-time schema install, outputs.
 *
 *   bun alchemy dev examples/todos/alchemy.run.ts
 *   VITE_RIPPLE_URL=http://localhost:8787 bunx vite examples/todos
 *
 * Run it from the repo root — `Peer`'s `main` is repo-relative.
 */

import * as Ripple from "@ripple/alchemy";
import { SchemaFx } from "@ripple/alchemy";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Sys } from "./resources.ts";
import { Todos } from "./schema.ts";

// Actions run in the engine's process after their upstreams apply, so this uses
// the `*Local` layer: no host Worker, just the peer's deployed URL. Typed
// `create("todos", Todos)` validates the name and ensures the catalog — that
// ensure *is* the install.

export const InstallSchema = Alchemy.Action(
  "InstallSchema",
  Effect.gen(function* () {
    const system = SchemaFx.fromWrite(yield* Ripple.WriteSystem(Sys));
    return Effect.fn(function* () {
      yield* system.create("todos", Todos);
    });
  }).pipe(Effect.provide(Ripple.WriteSystemLocal)),
);

export default Alchemy.Stack(
  "ripple-todos",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Ripple.providers()),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const sys = yield* Sys;
    yield* InstallSchema({});
    return { peerUrl: sys.url };
  }),
);
