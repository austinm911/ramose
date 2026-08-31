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
export declare const asLookupRef: (value: unknown) => readonly [string, unknown] | undefined;
export declare const lowerEntityArg: (entity: unknown) => unknown;
export declare const lowerWriteValue: (value: unknown) => unknown;
export {};
//# sourceMappingURL=entityArg.d.ts.map