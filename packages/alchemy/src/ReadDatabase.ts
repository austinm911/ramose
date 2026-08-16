/**
 * Bind a {@link Database} with read access and obtain the Effect-native
 * client (`q`, `query`, `pull`, `entity`, `info`, `asOf`, `history`).
 *
 * `ReadDatabase` is a single identifier that is simultaneously the binding's
 * Context tag, its type, and the callable — `yield* Ripple.ReadDatabase(db)`.
 *
 * @binding
 * @product Ripple
 * @category Storage & Databases
 */

import * as Binding from "alchemy/Binding";
import type * as Effect from "effect/Effect";
import type { ReadDatabaseClient } from "./Client.ts";
import type { Database } from "./Database.ts";

export interface ReadDatabase
  extends Binding.Service<
    ReadDatabase,
    "Ripple.ReadDatabase",
    (database: Database) => Effect.Effect<ReadDatabaseClient>
  > {}

export const ReadDatabase = Binding.Service<ReadDatabase>(
  "Ripple.ReadDatabase",
);
