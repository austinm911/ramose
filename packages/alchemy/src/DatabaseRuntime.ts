/**
 * Carrying a {@link Database}'s attributes into the runtime.
 *
 * A resource attribute is an `Output`, not a value: at deploy time it is a
 * promise the engine has not kept yet, and inside the deployed bundle it is
 * not present at all. `Output.bind(key)` is the bridge — it registers the
 * value under `key` on whatever host the binding is attaching to (a Worker
 * `plain_text` / `secret_text` binding; `Redacted` values keep their wrapper
 * and land as secrets) and hands back an *accessor*: an Effect that reads
 * that key back out of the environment at runtime.
 *
 * **The registration half is not lazy.** A Worker's `Props.env` is snapshotted
 * the instant its init Effect returns (`alchemy/Local/Platform.ts`:
 * `instance.Props = { ...props, env: { ...props.env, ...runtimeContext.env } }`),
 * and an `Alchemy.Action` only has its *capture* RuntimeContext ambient while
 * its init Effect runs (`alchemy/ActionRuntimeContext.ts`) — at apply time the
 * resolve context's `set` is a no-op. So `bind` MUST be called while the host
 * is still initializing, i.e. inside the capability's `Effect.fn(function*
 * (database) { … })`, not per request. Binding lazily from inside a client
 * method registers nothing and reads back `undefined`.
 *
 * NOT exported from `index.ts` — internal scaffolding shared by the Binding,
 * Http and Local layers.
 */

import * as Output from "alchemy/Output";
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

/**
 * Register `output` under `key` on the host **now** (deploy time) and return
 * the accessor that reads it back at runtime.
 *
 * The `RuntimeContext` requirement is erased, exactly as Alchemy's own
 * `Output.asEffect()` erases it (`alchemy/Output.ts`): the context is ambient
 * wherever a capability binds — a Worker's init closure, an Action's init
 * Effect — but the `Binding.Service` shapes (KV's, `Workers.Fetch`'s, ours)
 * are all typed `(resource) => Effect.Effect<Client>`.
 */
export const bindOutput = <A>(
  key: string,
  output: Output.Output<A>,
): Effect.Effect<Effect.Effect<A>> =>
  output.bind(key) as Effect.Effect<Effect.Effect<A>>;

/**
 * The token, as a value that survives an env binding.
 *
 * `undefined` does not: it would classify as a `json` binding holding
 * nothing. The empty string does, and the client treats it as "no token".
 */
export const bindToken = (
  database: Database,
): Effect.Effect<Effect.Effect<Redacted.Redacted<string> | string>> =>
  bindOutput(
    envKeys(database).token,
    database.token.pipe(Output.map((token) => token ?? "")) as Output.Output<
      Redacted.Redacted<string> | string
    >,
  );

/**
 * Read a bound value that must be there. A missing key means the binding was
 * never registered on this host (the capability was provided somewhere the
 * host could not take bindings), which would otherwise surface as a request
 * to `https://undefined/db/undefined/...`.
 */
export const required = (
  key: string,
  accessor: Effect.Effect<string>,
): Effect.Effect<string> =>
  accessor.pipe(
    Effect.flatMap((value) =>
      value === undefined || value === null || value === ""
        ? Effect.die(
            new Error(
              `ripple: no value bound under "${key}" — the database capability must be provided on a host that takes bindings (a Cloudflare.Worker, or an Alchemy.Action via the *DatabaseLocal layers)`,
            ),
          )
        : Effect.succeed(value),
    ),
  );
