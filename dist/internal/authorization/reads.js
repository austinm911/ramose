import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { query } from "../core/query/engine.js";
import { pull } from "../core/query/pull.js";
import { executeAuthorizedRequest, } from "./request.js";
export class OneShotReadError extends Data.TaggedError("OneShotReadError") {
}
const resolveEid = (db, ref) => typeof ref === "number" ? Promise.resolve(ref) : db.entid(ref);
export const runOneShotRead = async (db, read, opts = {}) => {
    switch (read.kind) {
        case "query":
            return query(db, read.query, read.inputs === undefined ? [] : [...read.inputs], {
                ...(opts.maxCells === undefined ? {} : { maxCells: opts.maxCells }),
            });
        case "pull": {
            const eid = await resolveEid(db, read.eid);
            if (eid === undefined)
                return null;
            return pull(db, eid, read.pattern);
        }
        case "entity": {
            const eid = await resolveEid(db, read.ref);
            if (eid === undefined)
                return null;
            return (await db.entity(eid)) ?? null;
        }
        case "lookup":
            return (await db.entid([read.ref[0], read.ref[1]])) ?? null;
    }
};
export const executeAuthorizedRead = (input, read, opts = {}) => executeAuthorizedRequest(input, (filteredDb) => Effect.tryPromise({
    try: () => runOneShotRead(filteredDb, read, opts),
    catch: (cause) => new OneShotReadError({ cause }),
}));
//# sourceMappingURL=reads.js.map