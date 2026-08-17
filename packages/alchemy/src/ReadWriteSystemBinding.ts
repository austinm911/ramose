import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { databasesOf } from "./Source.ts";
import { ReadWriteSystem } from "./ReadWriteSystem.ts";
import { makeSystemBinding } from "./SystemBinding.ts";

/** Implementation of the {@link ReadWriteSystem} binding that uses a Worker service binding to the peer. */
export const ReadWriteSystemBinding = Layer.effect(
  ReadWriteSystem,
  Effect.suspend(() => makeSystemBinding({ makeClient: databasesOf })),
);
