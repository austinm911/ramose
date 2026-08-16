import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeWriteClient } from "./Client.ts";
import { makeDatabaseHttp } from "./DatabaseHttp.ts";
import { WriteDatabase } from "./WriteDatabase.ts";

/** HTTPS-backed implementation of the {@link WriteDatabase} binding. */
export const WriteDatabaseHttp = Layer.effect(
  WriteDatabase,
  Effect.suspend(() => makeDatabaseHttp({ makeClient: makeWriteClient })),
);
