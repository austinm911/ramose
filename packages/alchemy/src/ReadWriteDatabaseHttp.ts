import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeReadWriteClient } from "./Client.ts";
import { makeDatabaseHttp } from "./DatabaseHttp.ts";
import { ReadWriteDatabase } from "./ReadWriteDatabase.ts";

/** HTTPS-backed implementation of the {@link ReadWriteDatabase} binding. */
export const ReadWriteDatabaseHttp = Layer.effect(
  ReadWriteDatabase,
  Effect.suspend(() => makeDatabaseHttp({ makeClient: makeReadWriteClient })),
);
