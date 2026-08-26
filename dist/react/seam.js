/**
 * @internal The reader half of the seam `Db.ts` attaches under
 * `Symbol.for("ramose.db.seam")` — see `DbSeam` there; the shapes must stay
 * compatible, and `packages/ramose/test/db-seam.test.ts` pins the contract.
 * It exists because `db.asOf(t)` is pure and builds a new object per call:
 * keyed by identity, an inline view would re-subscribe — and, through the
 * effect's own `setState`, loop — every render. The `key` is the structural
 * dependency a hook actually means.
 */
const DB_SEAM = Symbol.for("ramose.db.seam");
export const seamOf = (db) => db[DB_SEAM];
/**
 * The effect / memo dependency a hook keys on `db`: structural when the seam
 * is there (every db a real client builds), identity for anything else (a
 * hand-rolled test double).
 */
export const viewDep = (db) => seamOf(db)?.key ?? db;
const objectKeys = new WeakMap();
let nextObjectKey = 1;
/**
 * The view half of a live subscription key (`DbSeam.key`). Test doubles
 * without a seam get a stable per-object token so the cache Map can key
 * them as a string.
 */
export const viewKeyOf = (db) => {
    const key = seamOf(db)?.key;
    if (key !== undefined)
        return key;
    const obj = db;
    let id = objectKeys.get(obj);
    if (id === undefined) {
        id = `#${nextObjectKey++}`;
        objectKeys.set(obj, id);
    }
    return id;
};
//# sourceMappingURL=seam.js.map