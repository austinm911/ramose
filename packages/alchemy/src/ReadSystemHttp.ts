import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeReadSystemClient } from "./Client.ts";
import { ReadSystem } from "./ReadSystem.ts";
import { makeSystemHttp } from "./SystemHttp.ts";

/** HTTPS-backed implementation of the {@link ReadSystem} binding. */
export const ReadSystemHttp = Layer.effect(
  ReadSystem,
  Effect.suspend(() => makeSystemHttp({ makeClient: makeReadSystemClient })),
);
