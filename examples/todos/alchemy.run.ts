/** bun alchemy dev examples/todos/alchemy.run.ts
 *  VITE_RIPPLE_URL=http://localhost:8787 bunx vite examples/todos
 */

import * as Ripple from "@ripple/alchemy";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Sys } from "./resources.ts";
import { Todos } from "./schema.ts";

export const InstallSchema = Alchemy.Action(
  "InstallSchema",
  Effect.gen(function* () {
    const system = Ripple.fromWrite(yield* Ripple.WriteSystem(Sys));
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
