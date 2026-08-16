import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeReadWriteClient } from "./Client.ts";
import { makeDatabaseLocal } from "./DatabaseLocal.ts";
import { ReadWriteDatabase } from "./ReadWriteDatabase.ts";

/**
 * Local implementation of the {@link ReadWriteDatabase} binding — for
 * `Alchemy.Action`s and `alchemy dev`.
 */
export const ReadWriteDatabaseLocal = Layer.effect(
  ReadWriteDatabase,
  Effect.suspend(() => makeDatabaseLocal({ makeClient: makeReadWriteClient })),
);
