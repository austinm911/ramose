import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeWriteSystemClient } from "./Client.ts";
import { makeSystemLocal } from "./SystemLocal.ts";
import { WriteSystem } from "./WriteSystem.ts";

/**
 * Local implementation of the {@link WriteSystem} binding — installing schema
 * into a database from an `Alchemy.Action` is the canonical use.
 *
 * @example Installing schema after deploy
 * ```typescript
 * const Seed = Alchemy.Action(
 *   "Seed",
 *   Effect.gen(function* () {
 *     const system = yield* Ripple.WriteSystem(Sys);
 *     return Effect.fn(function* () {
 *       const movies = yield* system.create("movies");
 *       return yield* movies.transact([{ ":db/ident": ":user/name" }]);
 *     });
 *   }).pipe(Effect.provide(Ripple.WriteSystemLocal)),
 * );
 * ```
 */
export const WriteSystemLocal = Layer.effect(
  WriteSystem,
  Effect.suspend(() => makeSystemLocal({ makeClient: makeWriteSystemClient })),
);
