import { Session } from "@ripple/alchemy/db";
import * as Effect from "effect/Effect";
import { Todos } from "../schema.ts";

export const run = <A, E>(
  effect: Effect.Effect<A, E>,
): Promise<A> => Effect.runPromise(effect);

export const { session, db } = await run(
  Session.connect({
    url: import.meta.env.VITE_RIPPLE_URL ?? "http://localhost:8787",
    name: "todos",
    catalog: Todos,
    token: import.meta.env.VITE_RIPPLE_TOKEN,
  }),
);
