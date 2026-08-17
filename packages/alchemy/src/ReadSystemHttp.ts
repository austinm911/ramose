import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { databasesOf } from "./Source.ts";
import { ReadSystem } from "./ReadSystem.ts";
import { makeSystemHttp } from "./SystemHttp.ts";

/** Implementation of the {@link ReadSystem} binding that talks to the peer's public URL. */
export const ReadSystemHttp = Layer.effect(
  ReadSystem,
  Effect.suspend(() => makeSystemHttp({ makeClient: databasesOf })),
);
