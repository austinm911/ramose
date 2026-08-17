/**
 * Bind a {@link System} with read + write access and obtain the client:
 * `Databases`, whose one method `db(name, catalog)` is pure — no request, no
 * ensure, no socket per call.
 *
 * `ReadWriteSystem` is a single identifier that is simultaneously the binding's
 * Context tag, its type, and the callable — `yield* Ripple.ReadWriteSystem(Sys)`.
 *
 * @binding
 * @product Ripple
 * @category Storage & Databases
 */

import * as Binding from "alchemy/Binding";
import type * as Effect from "effect/Effect";
import type { DatabasesShape } from "./db/internal.ts";
import type { System } from "./System.ts";

export interface ReadWriteSystem
  extends Binding.Service<
    ReadWriteSystem,
    "Ripple.ReadWriteSystem",
    (system: System) => Effect.Effect<DatabasesShape>
  > {}

export const ReadWriteSystem = Binding.Service<ReadWriteSystem>("Ripple.ReadWriteSystem");
