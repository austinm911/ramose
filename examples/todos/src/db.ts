/**
 * One client for the page, closed with it.
 *
 * `Ripple.connect` throws only on a provisioning mistake (a malformed URL),
 * and the session socket is opened lazily by the first read, so module scope
 * is honest — no runtime to build, nothing to dispose but `ripple.close()`.
 * `ripple.db("todos", Todos)` is pure: naming a database costs no request,
 * and a browser never installs schema (`alchemy.run.ts` does that at deploy).
 * Every `Db` method needs no environment, so writes run with
 * `Effect.runPromise(db.transact(…))`.
 */

import * as Ripple from "@ripple/alchemy/db";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { Todos } from "../schema.ts";

const token = import.meta.env.VITE_RIPPLE_TOKEN;

const ripple = Ripple.connect({
  url: import.meta.env.VITE_RIPPLE_URL ?? "http://localhost:8787",
  token:
    token === undefined || token === ""
      ? undefined
      : Effect.succeed(Redacted.make(token)),
});

export const db = ripple.db("todos", Todos);
