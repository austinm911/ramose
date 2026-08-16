/**
 * Bind a {@link Database} with read + write access and obtain the
 * Effect-native client (`transact`, `q`, `query`, `pull`, `entity`, `info`,
 * `asOf`, `history`).
 *
 * `ReadWriteDatabase` is a single identifier that is simultaneously the
 * binding's Context tag, its type, and the callable —
 * `yield* Ripple.ReadWriteDatabase(db)`.
 *
 * @binding
 * @product Ripple
 * @category Storage & Databases
 */

import * as Binding from "alchemy/Binding";
import type * as Effect from "effect/Effect";
import type { ReadWriteDatabaseClient } from "./Client.ts";
import type { Database } from "./Database.ts";

export interface ReadWriteDatabase
  extends Binding.Service<
    ReadWriteDatabase,
    "Ripple.ReadWriteDatabase",
    (database: Database) => Effect.Effect<ReadWriteDatabaseClient>
  > {}

export const ReadWriteDatabase = Binding.Service<ReadWriteDatabase>(
  "Ripple.ReadWriteDatabase",
);
