import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { databasesOf } from "./Source.ts";
import { ReadWriteSystem } from "./ReadWriteSystem.ts";
import { makeSystemLocal } from "./SystemLocal.ts";

/** Implementation of the {@link ReadWriteSystem} binding that runs in the engine's process (`Alchemy.Action`, `alchemy dev`). */
export const ReadWriteSystemLocal = Layer.effect(
  ReadWriteSystem,
  Effect.suspend(() => makeSystemLocal({ makeClient: databasesOf })),
);
