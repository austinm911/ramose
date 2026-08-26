/**
 * `ramose/db/effect` — the Effect hatch for the portable client.
 *
 * App code uses promises on `ramose/db` (`db.query`, `db.run`, `db.live`).
 * Effect users reach the same client through:
 *
 * - `db.effect.*` — Effect / Stream variants of every db method, including
 *   `db.effect.run` (the write path).
 * - this module — `layer` / `Databases` for an Effect-native connect.
 *
 * `ramose/effect` remains the opt-in re-export of Effect's own modules
 * (`Effect`, `Function`, `Schema`, `Stream`, `pipe`, …). Do not import
 * those from here.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeDatabases, resolvePlainToken, resolveTransport, } from "./factory.js";
export { runPromise } from "./promise.js";
/**
 * The capability. Yield it to get the client:
 *
 * ```typescript
 * const ramose = yield* Ramose.Databases;
 * const db = ramose.db("todos", Todos);
 * ```
 */
export class Databases extends Context.Service()("Ramose.Databases") {
}
/** Resolve a hatch token, including an Effect-valued one. */
const resolveEffectToken = (token) => {
    if (token === undefined)
        return undefined;
    if (Effect.isEffect(token))
        return token;
    return resolvePlainToken(token);
};
const configure = (options) => ({
    ...resolveTransport(options),
    token: resolveEffectToken(options.token),
});
/**
 * A `Databases` over a peer URL. Scoped: the sockets it opens are closed when
 * the layer's scope closes (a `ManagedRuntime` disposed with the page, a
 * `Layer.launch`, a test).
 */
export const layer = (options) => Layer.effect(Databases, Effect.gen(function* () {
    const { databases, close } = makeDatabases(configure(options));
    yield* Effect.addFinalizer(() => Effect.sync(close));
    return databases;
}));
//# sourceMappingURL=effect.js.map