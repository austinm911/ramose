/**
 * Minimal EDN reader for query strings and pull patterns.
 *
 * Mapping to JS (the same shapes the JS-form query API accepts):
 *   keyword  :foo/bar   → string ":foo/bar"
 *   symbol   ?x  _  +   → string "?x" / "_" / "+"
 *   string   "abc"      → string "abc"  (auto-wrapped as {const} if it looks like a symbol/keyword)
 *   number              → number
 *   true/false/nil      → boolean / null
 *   [ ... ]             → Array
 *   ( ... )             → EdnList
 *   { k v ... }         → plain object (keys stringified)
 *   #{ ... }            → Set
 *   #inst "..."         → Date
 *   #uuid "..."         → { vt: 6, v: "..." } (TaggedValue)
 *   #bytes "base64"     → Uint8Array
 */
export declare class EdnList {
    readonly items: unknown[];
    constructor(items: unknown[]);
}
/** Explicit constant wrapper (escapes symbol/keyword-looking strings). */
export declare class EdnConst {
    readonly value: unknown;
    constructor(value: unknown);
}
export declare function isEdnConstWrapper(x: unknown): x is EdnConst | {
    const: unknown;
};
export declare function unwrapEdnConst(x: EdnConst | {
    const: unknown;
}): unknown;
export declare function looksLikeSymbol(s: string): boolean;
export declare function readEdn(src: string): unknown;
/** Read all top-level forms. */
export declare function readEdnAll(src: string): unknown[];
/** Serialize a JS/EDN-ish value back to EDN text (for error messages / logging). */
export declare function printEdn(v: unknown): string;
//# sourceMappingURL=edn.d.ts.map