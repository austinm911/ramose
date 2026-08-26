/**
 * Carrying a {@link Server}'s attributes into the runtime.
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
 * (server) { … })`, not per request. Binding lazily from inside a client
 * method registers nothing and reads back `undefined`.
 *
 * NOT exported from `index.ts` — internal scaffolding shared by the two
 * transport layers.
 */
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
/**
 * Binding / env-var names a server contributes to its consumer.
 *
 * There is no `_DB` key: a server pins no database name. The name is chosen
 * per call by `ramose.db(name, catalog)`, so nothing about it can be lowered
 * at deploy time.
 */
export const envKeys = (server) => ({
    /** The service binding (and the `env` key the Fetcher arrives under). */
    service: server.LogicalId,
    url: `${server.LogicalId}_URL`,
    token: `${server.LogicalId}_TOKEN`,
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
export const bindOutput = (key, output) => output.bind(key);
/**
 * The token, as a value that survives an env binding.
 *
 * `undefined` does not: it would classify as a `json` binding holding
 * nothing. The empty string does, and the client treats it as "no token".
 */
export const bindToken = (server) => bindOutput(envKeys(server).token, server.token.pipe(Output.map((token) => token ?? "")));
/**
 * Read a bound value that must be there. A missing key means the binding was
 * never registered on this host (the capability was provided somewhere the
 * host could not take bindings), which would otherwise surface as a request
 * to `https://undefined/db/...`.
 */
export const required = (key, accessor) => accessor.pipe(Effect.flatMap((value) => value === undefined || value === null || value === ""
    ? Effect.die(new Error(`ramose: no value bound under "${key}" — the capability must be provided on a host that takes bindings (a Cloudflare.Worker, or an Alchemy.Action; Ramose.layer falls back to HTTPS when no service binding is present)`))
    : Effect.succeed(value)));
//# sourceMappingURL=ServerRuntime.js.map