/**
 * Bind a {@link System} with write access and obtain the Effect-native system
 * client — `create(name)` / `connect(name)` for a write-only database client
 * (`transact`), plus the peer's `health`.
 *
 * `WriteSystem` is a single identifier that is simultaneously the binding's
 * Context tag, its type, and the callable — `yield* Ripple.WriteSystem(Sys)`.
 *
 * @binding
 * @product Ripple
 * @category Storage & Databases
 */

import * as Binding from "alchemy/Binding";
import type * as Effect from "effect/Effect";
import type { WriteSystemClient } from "./Client.ts";
import type { System } from "./System.ts";

export interface WriteSystem
  extends Binding.Service<
    WriteSystem,
    "Ripple.WriteSystem",
    (system: System) => Effect.Effect<WriteSystemClient>
  > {}

export const WriteSystem = Binding.Service<WriteSystem>("Ripple.WriteSystem");
