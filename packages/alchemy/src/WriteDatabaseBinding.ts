import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeWriteClient } from "./Client.ts";
import { makeDatabaseBinding } from "./DatabaseBinding.ts";
import { WriteDatabase } from "./WriteDatabase.ts";

/**
 * Implementation of the {@link WriteDatabase} binding that uses a Worker
 * service binding to the peer.
 */
export const WriteDatabaseBinding = Layer.effect(
  WriteDatabase,
  Effect.suspend(() => makeDatabaseBinding({ makeClient: makeWriteClient })),
);
