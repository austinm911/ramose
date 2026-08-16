import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeReadWriteSystemClient } from "./Client.ts";
import { ReadWriteSystem } from "./ReadWriteSystem.ts";
import { makeSystemLocal } from "./SystemLocal.ts";

/**
 * Local implementation of the {@link ReadWriteSystem} binding — for
 * `Alchemy.Action`s and `alchemy dev`.
 */
export const ReadWriteSystemLocal = Layer.effect(
  ReadWriteSystem,
  Effect.suspend(() =>
    makeSystemLocal({ makeClient: makeReadWriteSystemClient }),
  ),
);
