import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { databasesOf } from "./Source.ts";
import { WriteSystem } from "./WriteSystem.ts";
import { makeSystemLocal } from "./SystemLocal.ts";

/** Implementation of the {@link WriteSystem} binding that runs in the engine's process (`Alchemy.Action`, `alchemy dev`). */
export const WriteSystemLocal = Layer.effect(
  WriteSystem,
  Effect.suspend(() => makeSystemLocal({ makeClient: databasesOf })),
);
