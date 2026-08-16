import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeReadClient } from "./Client.ts";
import { makeDatabaseLocal } from "./DatabaseLocal.ts";
import { ReadDatabase } from "./ReadDatabase.ts";

/**
 * Local implementation of the {@link ReadDatabase} binding — for
 * `Alchemy.Action`s and `alchemy dev`, where the code runs in the engine's
 * process against whatever URL the peer was just deployed to.
 *
 * @example Querying from an Action
 * ```typescript
 * const Check = Alchemy.Action(
 *   "Check",
 *   Effect.gen(function* () {
 *     const db = yield* Ripple.ReadDatabase(Movies);
 *     return Effect.fn(function* () {
 *       return yield* db.q(`[:find ?n :where [?e :user/name ?n]]`);
 *     });
 *   }).pipe(Effect.provide(Ripple.ReadDatabaseLocal)),
 * );
 * ```
 */
export const ReadDatabaseLocal = Layer.effect(
  ReadDatabase,
  Effect.suspend(() => makeDatabaseLocal({ makeClient: makeReadClient })),
);
