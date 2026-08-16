import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeReadWriteClient } from "./Client.ts";
import { makeDatabaseBinding } from "./DatabaseBinding.ts";
import { ReadWriteDatabase } from "./ReadWriteDatabase.ts";

/**
 * Implementation of the {@link ReadWriteDatabase} binding that uses a Worker
 * service binding to the peer.
 */
export const ReadWriteDatabaseBinding = Layer.effect(
  ReadWriteDatabase,
  Effect.suspend(() =>
    makeDatabaseBinding({ makeClient: makeReadWriteClient }),
  ),
);
