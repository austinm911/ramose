/**
 * The query language: kernel (`Q`), constructor and composition (`Query`),
 * the fluent app spelling (`Query.from`), and the pipeable stdlib. One
 * kind of object — every query is a rule — with two advanced spellings
 * (pipe, generator) under the fluent chain.
 */
export { Q, isVar, isValueSpec, mkVar, runBody, } from "./kernel.js";
export { decodeCursor, encodeCursor } from "./cursor.js";
export { enrich, isCursor, isPipeline, isQueryObject, isRuleValue, lowerQueryAst, lowerQueryObject, tryLowerQueryObject, q, refine, rule, } from "./query.js";
export { from } from "./fluent.js";
export { any, assertedBy, backlink, byId, entities, every, follow, gt, gte, has, ids, includes, is, limit, lt, lte, matching, missing, none, not, offset, orderBy, select, some, stage, startsWith, updatedSince, } from "./lib.js";
//# sourceMappingURL=index.js.map