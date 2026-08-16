import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeReadClient } from "./Client.ts";
import { makeDatabaseBinding } from "./DatabaseBinding.ts";
import { ReadDatabase } from "./ReadDatabase.ts";

/**
 * Implementation of the {@link ReadDatabase} binding that uses a Worker
 * service binding to the peer.
 */
export const ReadDatabaseBinding = Layer.effect(
  ReadDatabase,
  Effect.suspend(() => makeDatabaseBinding({ makeClient: makeReadClient })),
);
