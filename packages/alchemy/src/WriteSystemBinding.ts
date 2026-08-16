import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeWriteSystemClient } from "./Client.ts";
import { makeSystemBinding } from "./SystemBinding.ts";
import { WriteSystem } from "./WriteSystem.ts";

/**
 * Implementation of the {@link WriteSystem} binding that uses a Worker service
 * binding to the peer.
 */
export const WriteSystemBinding = Layer.effect(
  WriteSystem,
  Effect.suspend(() =>
    makeSystemBinding({ makeClient: makeWriteSystemClient }),
  ),
);
