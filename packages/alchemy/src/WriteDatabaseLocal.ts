import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeWriteClient } from "./Client.ts";
import { makeDatabaseLocal } from "./DatabaseLocal.ts";
import { WriteDatabase } from "./WriteDatabase.ts";

/**
 * Local implementation of the {@link WriteDatabase} binding — seeding a
 * database from an `Alchemy.Action` is the canonical use.
 *
 * @example Installing schema after deploy
 * ```typescript
 * const Seed = Alchemy.Action(
 *   "Seed",
 *   Effect.gen(function* () {
 *     const db = yield* Ripple.WriteDatabase(Movies);
 *     return Effect.fn(function* () {
 *       return yield* db.transact([{ ":db/ident": ":user/name" }]);
 *     });
 *   }).pipe(Effect.provide(Ripple.WriteDatabaseLocal)),
 * );
 * ```
 */
export const WriteDatabaseLocal = Layer.effect(
  WriteDatabase,
  Effect.suspend(() => makeDatabaseLocal({ makeClient: makeWriteClient })),
);
