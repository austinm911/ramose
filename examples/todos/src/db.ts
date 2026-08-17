import { Session } from "@ripple/alchemy/schema";
import { RuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import { Todos } from "../schema.ts";

export const run = <A, E>(
  effect: Effect.Effect<A, E, RuntimeContext>,
): Promise<A> => Effect.runPromise(effect.pipe(Effect.provide(RuntimeContext.phantom)));

export const { session, db } = await run(
  Session.connect({
    url: import.meta.env.VITE_RIPPLE_URL ?? "http://localhost:8787",
    name: "todos",
    catalog: Todos,
    token: import.meta.env.VITE_RIPPLE_TOKEN,
  }),
);
