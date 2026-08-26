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
import type * as Redacted from "effect/Redacted";
import type { ClientOptions } from "./connect.ts";
import type { DbError } from "./Errors.ts";
import type { DatabasesShape } from "./client-shape.ts";
import type { TokenInput } from "./token.ts";
export type { EffectDb, EffectReadDb } from "./effect-types.ts";
export type { DatabasesShape } from "./client-shape.ts";
export { runPromise } from "./promise.ts";
declare const Databases_base: Context.ServiceClass<Databases, "Ramose.Databases", DatabasesShape>;
/**
 * The capability. Yield it to get the client:
 *
 * ```typescript
 * const ramose = yield* Ramose.Databases;
 * const db = ramose.db("todos", Todos);
 * ```
 */
export declare class Databases extends Databases_base {
}
/**
 * Token the hatch / Worker transports still accept — a plain
 * {@link TokenInput} or an Effect of a redacted string.
 */
export type EffectToken = TokenInput | Effect.Effect<Redacted.Redacted<string>, DbError>;
/** Options for {@link layer} — `ClientOptions` plus an Effect-valued token. */
export interface EffectClientOptions extends Omit<ClientOptions, "token"> {
    readonly token?: EffectToken;
}
/**
 * A `Databases` over a peer URL. Scoped: the sockets it opens are closed when
 * the layer's scope closes (a `ManagedRuntime` disposed with the page, a
 * `Layer.launch`, a test).
 */
export declare const layer: (options: EffectClientOptions) => Layer.Layer<Databases>;
//# sourceMappingURL=effect.d.ts.map