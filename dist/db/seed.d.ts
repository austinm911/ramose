/**
 * @internal Raw `/transact` hatch for tests and seed. Not on the public
 * `ramose/db` barrel — importing this from `Db.ts` would pull `Tx` (and
 * Effect) into the client `.d.ts`.
 */
import * as Effect from "effect/Effect";
import type { EffectDb } from "./effect-types.ts";
import type { AnySchema } from "./Schema.ts";
import { type Db, type TxReport } from "./Db.ts";
import { type DbError } from "./Errors.ts";
import { type Tx } from "./Tx.ts";
/**
 * Submit raw tx ops through the existing wire (`overlay.transact` or
 * `POST /transact`). Tests and seed paths only — not a public write.
 */
export declare const submitRaw: <C extends AnySchema>(db: Db<C> | EffectDb<C>, ops: readonly unknown[]) => Effect.Effect<TxReport<C>, DbError>;
/**
 * Run a builder body and {@link submitRaw} the collected ops.
 * Tests / seed only. App writes use {@link Db.run}.
 */
export declare const seedWrite: <C extends AnySchema>(db: Db<C> | EffectDb<C>, body: (tx: Tx<C>) => Generator<Effect.Effect<any, any, any>, unknown, any>) => Effect.Effect<TxReport<C>, DbError>;
//# sourceMappingURL=seed.d.ts.map