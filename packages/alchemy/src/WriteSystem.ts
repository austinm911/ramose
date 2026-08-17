/**
 * Bind a {@link System} with write access and obtain the client:
 * `Databases`, whose one method `db(name, catalog)` is pure — no request, no
 * ensure, no socket per call.
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
import type { DatabasesShape } from "./db/internal.ts";
import type { System } from "./System.ts";

export interface WriteSystem
  extends Binding.Service<
    WriteSystem,
    "Ripple.WriteSystem",
    (system: System) => Effect.Effect<DatabasesShape>
  > {}

export const WriteSystem = Binding.Service<WriteSystem>("Ripple.WriteSystem");
