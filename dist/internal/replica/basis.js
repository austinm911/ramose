/**
 * Basis: what a peer needs to build a `Db` value without talking to the
 * Transactor — the current root record plus the novelty since that root.
 * Served by QueryReplica DOs (`GET /basis`), consumed by Workers.
 */
import { Db, Novelty, Schema, deriveSchema, entryFromFrame, txFrame, } from "../core/index.js";
import { recordToRoots } from "../storage/index.js";
export function makeBasis(db, root, entries, replica) {
    const t = entries.length ? entries[entries.length - 1].t : root.t;
    return { v: 1, db, t, root, novelty: entries.map(txFrame), replica };
}
/** Per-isolate cache of derived schemas keyed by root (EAVT hash). */
const schemaCache = new Map();
/** Build an immutable Db value from a basis over the given segment source. */
export async function dbFromBasis(store, basis, opts = {}) {
    const roots = recordToRoots(basis.root);
    const key = roots.eavt.hash;
    let sp = schemaCache.get(key);
    if (!sp) {
        sp = deriveSchema(store, roots);
        schemaCache.set(key, sp);
        // never cache a failure (a transient read error would poison every db sharing this root hash)
        sp.catch(() => schemaCache.delete(key));
        if (schemaCache.size > 32)
            schemaCache.delete(schemaCache.keys().next().value);
    }
    const rootSchema = await sp;
    const entries = basis.novelty.map(entryFromFrame);
    const allDatoms = entries.flatMap((e) => e.datoms);
    const schema = allDatoms.length ? rootSchema.clone().apply(allDatoms) : rootSchema;
    const novelty = new Novelty();
    novelty.add(allDatoms, (a) => schema.isAvet(a), (a) => schema.isVaet(a));
    let db = new Db({ store, roots, novelty, basisT: basis.t, schema, nextEid: basis.root.next_eid });
    if (typeof opts.asOf === "number")
        db = db.asOf(opts.asOf);
    if (opts.history)
        db = db.history();
    return db;
}
//# sourceMappingURL=basis.js.map