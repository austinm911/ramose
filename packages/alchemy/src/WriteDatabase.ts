/**
 * Bind a {@link Database} with write access and obtain the Effect-native
 * client (`transact`).
 *
 * `WriteDatabase` is a single identifier that is simultaneously the binding's
 * Context tag, its type, and the callable — `yield* Ripple.WriteDatabase(db)`.
 *
 * @binding
 * @product Ripple
 * @category Storage & Databases
 */

import * as Binding from "alchemy/Binding";
import type * as Effect from "effect/Effect";
import type { WriteDatabaseClient } from "./Client.ts";
import type { Database } from "./Database.ts";

export interface WriteDatabase
  extends Binding.Service<
    WriteDatabase,
    "Ripple.WriteDatabase",
    (database: Database) => Effect.Effect<WriteDatabaseClient>
  > {}

export const WriteDatabase = Binding.Service<WriteDatabase>(
  "Ripple.WriteDatabase",
);
