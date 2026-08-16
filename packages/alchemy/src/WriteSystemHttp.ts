import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeWriteSystemClient } from "./Client.ts";
import { makeSystemHttp } from "./SystemHttp.ts";
import { WriteSystem } from "./WriteSystem.ts";

/** HTTPS-backed implementation of the {@link WriteSystem} binding. */
export const WriteSystemHttp = Layer.effect(
  WriteSystem,
  Effect.suspend(() => makeSystemHttp({ makeClient: makeWriteSystemClient })),
);
