/**
 * @internal Raw `/transact` hatch for tests and seed. Not on the public
 * `ramose/db` barrel — importing this from `Db.ts` would pull `Tx` (and
 * Effect) into the client `.d.ts`.
 */
import * as Effect from "effect/Effect";
import { DB_SUBMIT } from "./Db.js";
import { InvalidRequest } from "./Errors.js";
import { txBuilder, txOps } from "./Tx.js";
/**
 * Submit raw tx ops through the existing wire (`overlay.transact` or
 * `POST /transact`). Tests and seed paths only — not a public write.
 */
export const submitRaw = (db, ops) => {
    const hatch = "effect" in db ? db.effect : db;
    const submit = hatch[DB_SUBMIT];
    if (submit === undefined) {
        return Effect.fail(new InvalidRequest({ message: "ramose: raw submit is not available" }));
    }
    return submit(ops);
};
/**
 * Run a builder body and {@link submitRaw} the collected ops.
 * Tests / seed only. App writes use {@link Db.run}.
 */
export const seedWrite = (db, body) => Effect.gen(function* () {
    const tx = txBuilder(("schema" in db ? db.schema : undefined));
    const gen = body(tx);
    let step = gen.next();
    while (!step.done) {
        const value = yield* step.value;
        step = gen.next(value);
    }
    return yield* submitRaw(db, [...txOps(tx)]);
});
//# sourceMappingURL=seed.js.map