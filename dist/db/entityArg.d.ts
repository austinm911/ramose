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
declare const TempidBrand: unique symbol;
/**
 * A named tempid. Not a bare `string` — `add("oops-typo", …)` is a type
 * error. Produce one with {@link tempid} / `op.tempid` / `tx.tempid`.
 */
export type Tempid = string & {
    readonly [TempidBrand]: true;
};
/** Brand a string as a tempid. The wire form is the string itself. */
export declare const tempid: (name: string) => Tempid;
/**
 * `[User.name, "Ada"]` / `[":user/name", "Ada"]` → the wire lookup
 * `[":user/name", "Ada"]`. `undefined` when `value` is not a lookup.
 */
export declare const asLookupRef: (value: unknown) => readonly [string, unknown] | undefined;
/**
 * Lower an entity argument to an eid, tempid string, lookup, or
 * `undefined`. Used by `db.run`, `put` / `set` subjects, and `db.pull`.
 */
export declare const lowerEntityArg: (entity: unknown) => unknown;
/**
 * Lower a write value: entity forms via {@link lowerEntityArg}, then
 * each element of a cardinality-many array. A two-element ident lookup
 * is one value, not a pair to map.
 */
export declare const lowerWriteValue: (value: unknown) => unknown;
export {};
//# sourceMappingURL=entityArg.d.ts.map