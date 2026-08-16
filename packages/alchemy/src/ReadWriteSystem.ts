/**
 * Bind a {@link System} with read + write access and obtain the Effect-native
 * system client — `create(name)` / `connect(name)` for a full database client
 * (`transact`, `q`, `query`, `pull`, `entity`, `info`, `asOf`, `history`),
 * plus the peer's `health`.
 *
 * `ReadWriteSystem` is a single identifier that is simultaneously the
 * binding's Context tag, its type, and the callable —
 * `yield* Ripple.ReadWriteSystem(Sys)`.
 *
 * @binding
 * @product Ripple
 * @category Storage & Databases
 */

import * as Binding from "alchemy/Binding";
import type * as Effect from "effect/Effect";
import type { ReadWriteSystemClient } from "./Client.ts";
import type { System } from "./System.ts";

export interface ReadWriteSystem
  extends Binding.Service<
    ReadWriteSystem,
    "Ripple.ReadWriteSystem",
    (system: System) => Effect.Effect<ReadWriteSystemClient>
  > {}

export const ReadWriteSystem = Binding.Service<ReadWriteSystem>(
  "Ripple.ReadWriteSystem",
);
