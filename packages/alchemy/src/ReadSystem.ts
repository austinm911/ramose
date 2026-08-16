/**
 * Bind a {@link System} with read access and obtain the Effect-native system
 * client — `create(name)` / `connect(name)` for a read-only database client
 * (`q`, `query`, `pull`, `entity`, `info`, `asOf`, `history`), plus the peer's
 * `health`.
 *
 * `ReadSystem` is a single identifier that is simultaneously the binding's
 * Context tag, its type, and the callable — `yield* Ripple.ReadSystem(Sys)`.
 *
 * @binding
 * @product Ripple
 * @category Storage & Databases
 */

import * as Binding from "alchemy/Binding";
import type * as Effect from "effect/Effect";
import type { ReadSystemClient } from "./Client.ts";
import type { System } from "./System.ts";

export interface ReadSystem
  extends Binding.Service<
    ReadSystem,
    "Ripple.ReadSystem",
    (system: System) => Effect.Effect<ReadSystemClient>
  > {}

export const ReadSystem = Binding.Service<ReadSystem>("Ripple.ReadSystem");
