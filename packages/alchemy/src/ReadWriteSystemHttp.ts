import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { databasesOf } from "./Source.ts";
import { ReadWriteSystem } from "./ReadWriteSystem.ts";
import { makeSystemHttp } from "./SystemHttp.ts";

/** Implementation of the {@link ReadWriteSystem} binding that talks to the peer's public URL. */
export const ReadWriteSystemHttp = Layer.effect(
  ReadWriteSystem,
  Effect.suspend(() => makeSystemHttp({ makeClient: databasesOf })),
);
