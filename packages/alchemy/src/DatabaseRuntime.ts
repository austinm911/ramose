/**
 * Carrying a {@link Database}'s attributes into the runtime.
 *
 * A resource attribute is an `Output`, not a value: at deploy time it is a
 * promise the engine has not kept yet, and inside the deployed bundle it is
 * not present at all. `Output.bind(key)` is the bridge — at deploy time it
 * registers the value under `key` on whatever host the binding is attaching
 * to (a Worker `plain_text` / `secret_text` binding; `Redacted` values keep
 * their wrapper and land as secrets), and at runtime it reads that key back
 * out of the environment. Hence the `RuntimeContext` in every client method's
 * requirements.
 *
 * NOT exported from `index.ts` — internal scaffolding shared by the Binding,
 * Http and Local layers.
 */

import * as Output from "alchemy/Output";
import type { RuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";
import type { Database } from "./Database.ts";

/** Binding / env-var names a database contributes to its consumer. */
export const envKeys = (database: Pick<Database, "LogicalId">) => ({
  /** The service binding (and the `env` key the Fetcher arrives under). */
  service: database.LogicalId,
  url: `${database.LogicalId}_URL`,
  name: `${database.LogicalId}_DB`,
  token: `${database.LogicalId}_TOKEN`,
});

/** Bind an Output under `key` at deploy time; read it back at runtime. */
export const runtimeOutput = <A>(
  key: string,
  output: Output.Output<A>,
): Effect.Effect<A, never, RuntimeContext> =>
  output.bind(key).pipe(Effect.flatMap((accessor) => accessor));

/**
 * The token, as a value that survives an env binding.
 *
 * `undefined` does not: it would classify as a `json` binding holding
 * nothing. The empty string does, and the client treats it as "no token".
 */
export const tokenOutput = (
  database: Database,
): Effect.Effect<Redacted.Redacted<string> | string, never, RuntimeContext> =>
  runtimeOutput(
    envKeys(database).token,
    database.token.pipe(
      Output.map((token) => token ?? ""),
    ) as Output.Output<Redacted.Redacted<string> | string>,
  );
