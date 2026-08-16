import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeReadWriteSystemClient } from "./Client.ts";
import { ReadWriteSystem } from "./ReadWriteSystem.ts";
import { makeSystemHttp } from "./SystemHttp.ts";

/** HTTPS-backed implementation of the {@link ReadWriteSystem} binding. */
export const ReadWriteSystemHttp = Layer.effect(
  ReadWriteSystem,
  Effect.suspend(() =>
    makeSystemHttp({ makeClient: makeReadWriteSystemClient }),
  ),
);
