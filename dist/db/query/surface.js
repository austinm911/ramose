/**
 * `Ramose.Query` — the query language's named surface. `Query.from` is the
 * primary app spelling; `Query.q` is the generator/kernel constructor;
 * `Query.rule` names; the stdlib combinators stay one tier down. (`Ramose.Q`
 * is the kernel.)
 */
export { decodeCursor, encodeCursor } from "./cursor.js";
export { enrich, isCursor, q, refine, rule } from "./query.js";
export { from } from "./fluent.js";
export { any, assertedBy, backlink, byId, entities, every, follow, gt, gte, has, ids, includes, is, limit, lt, lte, matching, missing, none, not, offset, orderBy, select, some, stage, startsWith, updatedSince, } from "./lib.js";
//# sourceMappingURL=surface.js.map