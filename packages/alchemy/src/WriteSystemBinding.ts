import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { databasesOf } from "./Source.ts";
import { WriteSystem } from "./WriteSystem.ts";
import { makeSystemBinding } from "./SystemBinding.ts";

/** Implementation of the {@link WriteSystem} binding that uses a Worker service binding to the peer. */
export const WriteSystemBinding = Layer.effect(
  WriteSystem,
  Effect.suspend(() => makeSystemBinding({ makeClient: databasesOf })),
);
