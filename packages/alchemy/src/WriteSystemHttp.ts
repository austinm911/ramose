import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { databasesOf } from "./Source.ts";
import { WriteSystem } from "./WriteSystem.ts";
import { makeSystemHttp } from "./SystemHttp.ts";

/** Implementation of the {@link WriteSystem} binding that talks to the peer's public URL. */
export const WriteSystemHttp = Layer.effect(
  WriteSystem,
  Effect.suspend(() => makeSystemHttp({ makeClient: databasesOf })),
);
