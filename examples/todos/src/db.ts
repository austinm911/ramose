/**
 * One runtime for the page, disposed with it.
 *
 * `Ripple.layer` is scoped — the session socket is its finalizer — and getting
 * a `Databases` out of it cannot fail, so `runSync` is honest here.
 * `ripple.db("todos", Todos)` is pure: naming a database costs no request, and
 * a browser never installs schema (`alchemy.run.ts` does that at deploy).
 */

import * as Ripple from "@ripplegraph/alchemy/db";
import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Redacted from "effect/Redacted";
import { Todos } from "../schema.ts";

const token = import.meta.env.VITE_RIPPLE_TOKEN;

const runtime = ManagedRuntime.make(
  Ripple.layer({
    url: import.meta.env.VITE_RIPPLE_URL ?? "http://localhost:8787",
    token:
      token === undefined || token === ""
        ? undefined
        : Effect.succeed(Redacted.make(token)),
  }),
);

export const run = runtime.runPromise;
export const db = runtime.runSync(Ripple.Databases).db("todos", Todos);
