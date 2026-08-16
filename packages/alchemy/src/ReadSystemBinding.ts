import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeReadSystemClient } from "./Client.ts";
import { ReadSystem } from "./ReadSystem.ts";
import { makeSystemBinding } from "./SystemBinding.ts";

/**
 * Implementation of the {@link ReadSystem} binding that uses a Worker service
 * binding to the peer.
 */
export const ReadSystemBinding = Layer.effect(
  ReadSystem,
  Effect.suspend(() => makeSystemBinding({ makeClient: makeReadSystemClient })),
);
