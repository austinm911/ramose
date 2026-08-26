/**
 * Shared entity-argument lowering — one function for `db.run`, `put` /
 * datom `set`, and `db.pull`.
 *
 * Admits the {@link EntityRef} vocabulary at runtime: branded eids (plain
 * numbers), `{ id }` rows, nominal tempids (plain strings), lookup refs,
 * handles, and `op.principal`. A raw string that was never passed through
 * {@link tempid} is indistinguishable at runtime (the brand is type-only);
 * the typed surfaces reject it.
 */
import { isAttrRef } from "./attrRef.js";
/** Brand a string as a tempid. The wire form is the string itself. */
export const tempid = (name) => {
    if (typeof name !== "string" || name.length === 0) {
        throw new Error("ramose: tempid() needs a non-empty string");
    }
    return name;
};
/**
 * `[User.name, "Ada"]` / `[":user/name", "Ada"]` → the wire lookup
 * `[":user/name", "Ada"]`. `undefined` when `value` is not a lookup.
 */
export const asLookupRef = (value) => {
    if (!Array.isArray(value) || value.length !== 2)
        return undefined;
    const head = value[0];
    const ident = typeof head === "string"
        ? head
        : isAttrRef(head)
            ? head.ident
            : typeof head === "object" &&
                head !== null &&
                "ident" in head &&
                typeof head.ident === "string"
                ? head.ident
                : undefined;
    if (ident === undefined || ident[0] !== ":")
        return undefined;
    return [ident, value[1]];
};
const isTxHandleLike = (e) => typeof e === "object" &&
    e !== null &&
    e._tag === "TxHandle";
const isIdRow = (v) => typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    "id" in v &&
    typeof v.id === "number" &&
    !isTxHandleLike(v);
/** `op.principal` — `{ eid, class }`, not a handle (handles have `_tag`). */
const isPrincipal = (v) => typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    "eid" in v &&
    "class" in v &&
    typeof v.class === "string" &&
    (v.eid === null ||
        typeof v.eid === "number") &&
    !isTxHandleLike(v);
/**
 * Lower an entity argument to an eid, tempid string, lookup, or
 * `undefined`. Used by `db.run`, `put` / `set` subjects, and `db.pull`.
 */
export const lowerEntityArg = (entity) => {
    if (entity === undefined || entity === null)
        return entity;
    if (typeof entity === "number" || typeof entity === "string")
        return entity;
    const lookup = asLookupRef(entity);
    if (lookup !== undefined)
        return lookup;
    if (isTxHandleLike(entity))
        return lowerEntityArg(entity.eid);
    if (isIdRow(entity))
        return entity.id;
    if (isPrincipal(entity))
        return entity.eid === null ? undefined : entity.eid;
    return entity;
};
const isIdentLookup = (value) => Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    value[0][0] === ":";
/**
 * Lower a write value: entity forms via {@link lowerEntityArg}, then
 * each element of a cardinality-many array. A two-element ident lookup
 * is one value, not a pair to map.
 */
export const lowerWriteValue = (value) => {
    if (Array.isArray(value) && !isIdentLookup(value) && asLookupRef(value) === undefined) {
        return value.map(lowerWriteValue);
    }
    return lowerEntityArg(value);
};
//# sourceMappingURL=entityArg.js.map