import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { databasesOf } from "./Source.ts";
import { ReadSystem } from "./ReadSystem.ts";
import { makeSystemLocal } from "./SystemLocal.ts";

/** Implementation of the {@link ReadSystem} binding that runs in the engine's process (`Alchemy.Action`, `alchemy dev`). */
export const ReadSystemLocal = Layer.effect(
  ReadSystem,
  Effect.suspend(() => makeSystemLocal({ makeClient: databasesOf })),
);
