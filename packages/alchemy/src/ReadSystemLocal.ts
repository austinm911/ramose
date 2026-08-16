import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeReadSystemClient } from "./Client.ts";
import { ReadSystem } from "./ReadSystem.ts";
import { makeSystemLocal } from "./SystemLocal.ts";

/**
 * Local implementation of the {@link ReadSystem} binding — for
 * `Alchemy.Action`s and `alchemy dev`, where the code runs in the engine's
 * process against whatever URL the peer was just deployed to.
 *
 * @example Querying from an Action
 * ```typescript
 * const Check = Alchemy.Action(
 *   "Check",
 *   Effect.gen(function* () {
 *     const system = yield* Ripple.ReadSystem(Sys);
 *     return Effect.fn(function* () {
 *       const movies = yield* system.connect("movies");
 *       return yield* movies.q(`[:find ?n :where [?e :user/name ?n]]`);
 *     });
 *   }).pipe(Effect.provide(Ripple.ReadSystemLocal)),
 * );
 * ```
 */
export const ReadSystemLocal = Layer.effect(
  ReadSystem,
  Effect.suspend(() => makeSystemLocal({ makeClient: makeReadSystemClient })),
);
