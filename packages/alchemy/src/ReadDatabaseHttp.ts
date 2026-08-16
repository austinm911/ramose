import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeReadClient } from "./Client.ts";
import { makeDatabaseHttp } from "./DatabaseHttp.ts";
import { ReadDatabase } from "./ReadDatabase.ts";

/** HTTPS-backed implementation of the {@link ReadDatabase} binding. */
export const ReadDatabaseHttp = Layer.effect(
  ReadDatabase,
  Effect.suspend(() => makeDatabaseHttp({ makeClient: makeReadClient })),
);
