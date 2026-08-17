/**
 * Bind a {@link System} with read access and obtain the client:
 * `Databases`, whose one method `db(name, catalog)` is pure — no request, no
 * ensure, no socket per call.
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
import type { DatabasesShape } from "./db/internal.ts";
import type { System } from "./System.ts";

export interface ReadSystem
  extends Binding.Service<
    ReadSystem,
    "Ripple.ReadSystem",
    (system: System) => Effect.Effect<DatabasesShape>
  > {}

export const ReadSystem = Binding.Service<ReadSystem>("Ripple.ReadSystem");
