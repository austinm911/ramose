/**
 * Datom type, value model, order-preserving value encoding and the four
 * index-order comparators (EAVT / AEVT / AVET / VAET).
 *
 * A datom is `[e a v t op]`:
 *   e  — entity id      (u64 on disk; JS `number`, must be a safe integer)
 *   a  — attribute id   (u32; interned via the schema's `:db/ident`)
 *   v  — tagged value   (long | double | string | bool | ref | uuid | inst | bytes)
 *   t  — transaction    (u64 on disk; JS `number`)
 *   op — assert (true) / retract (false)
 *
 * Values are stored *flat* on the datom (`vt` = tag, `v` = primitive payload)
 * to avoid one extra allocation per datom; 1M-datom in-memory sets are a
 * design target and every byte per datom matters.
 *
 * All comparators here are *structural* (fast). `encodeValue` produces an
 * order-preserving byte string; the test-suite asserts that lexicographic
 * comparison of encoded bytes ≡ `compareValue`.
 */
/** Numeric tag identifying a value's type. Tag order == cross-type sort order. */
export declare const ValueTag: {
    readonly Long: 1;
    readonly Double: 2;
    readonly Str: 3;
    readonly Bool: 4;
    readonly Ref: 5;
    readonly Uuid: 6;
    readonly Inst: 7;
    readonly Bytes: 8;
};
export type ValueTag = (typeof ValueTag)[keyof typeof ValueTag];
export declare const ValueTagName: Record<ValueTag, string>;
/** Payload representation per tag. */
export type DatomValue = number | string | boolean | Uint8Array;
/** A tagged value, used at API boundaries (the datom itself stores it flat). */
export interface TaggedValue {
    readonly vt: ValueTag;
    readonly v: DatomValue;
}
export interface Datom {
    readonly e: number;
    readonly a: number;
    readonly vt: ValueTag;
    readonly v: DatomValue;
    readonly t: number;
    /** true = assert, false = retract */
    readonly op: boolean;
}
export declare function datom(e: number, a: number, vt: ValueTag, v: DatomValue, t: number, op?: boolean): Datom;
export declare const MAX_ID: number;
/**
 * Validate & normalize a payload for the given tag. Throws on type mismatch.
 * - doubles: -0 → +0, NaN rejected (NaN has no total order)
 * - longs / refs / insts: must be safe integers
 * - uuids: canonical lowercase 8-4-4-4-12 form
 */
export declare function normalizeValue(vt: ValueTag, v: DatomValue): DatomValue;
/**
 * Compare two JS strings by Unicode code point (== UTF-8 byte order), not by
 * UTF-16 code unit. The two orders differ only when a surrogate pair meets a
 * BMP char in U+E000..U+FFFF; we remap those ranges so a plain code-unit
 * comparison yields code-point order.
 */
export declare function compareStrings(a: string, b: string): number;
export declare function compareBytes(a: Uint8Array, b: Uint8Array): number;
/** Total order over all tagged values: by tag first, then by payload. */
export declare function compareValue(at: ValueTag, av: DatomValue, bt: ValueTag, bv: DatomValue): number;
export declare function valueEquals(at: ValueTag, av: DatomValue, bt: ValueTag, bv: DatomValue): boolean;
export declare const Index: {
    readonly EAVT: 0;
    readonly AEVT: 1;
    readonly AVET: 2;
    readonly VAET: 3;
};
export type IndexId = (typeof Index)[keyof typeof Index];
export declare const IndexName: Record<IndexId, string>;
export declare const ALL_INDEXES: readonly IndexId[];
export declare function cmpEAVT(x: Datom, y: Datom): number;
export declare function cmpAEVT(x: Datom, y: Datom): number;
export declare function cmpAVET(x: Datom, y: Datom): number;
export declare function cmpVAET(x: Datom, y: Datom): number;
export type DatomComparator = (x: Datom, y: Datom) => number;
export declare const COMPARATORS: Record<IndexId, DatomComparator>;
export declare function comparatorFor(index: IndexId): DatomComparator;
/** Two datoms are identical when all five components match. */
export declare function datomEquals(x: Datom, y: Datom): boolean;
/**
 * A prefix key: some leading components of an index key. Which components
 * are meaningful depends on the index order:
 *   EAVT: e, a, v, t     AEVT: a, e, v, t     AVET: a, v, e, t     VAET: v, a, e, t
 * A component that is `undefined` (and every component after it) is
 * unconstrained. Value is present iff `vt !== undefined`.
 */
export interface Prefix {
    readonly e?: number;
    readonly a?: number;
    readonly vt?: ValueTag;
    readonly v?: DatomValue;
    readonly t?: number;
}
/**
 * Compare a datom against a prefix in the given index's order.
 * Returns <0 if the datom sorts before every key matching the prefix,
 * 0 if it matches, >0 if it sorts after.
 */
export declare function comparePrefix(index: IndexId, d: Datom, p: Prefix): number;
/** Number of leading components a prefix constrains in the given index (0..4). */
export declare function prefixDepth(index: IndexId, p: Prefix): number;
export declare const INDEX_ORDER: Record<IndexId, readonly ("e" | "a" | "v" | "t")[]>;
/** 8-byte big-endian encoding of a signed integer with the sign bit flipped (order-preserving). */
export declare function encodeI64(n: number | bigint, out: Uint8Array, off: number): void;
export declare function decodeI64(buf: Uint8Array, off: number): bigint;
/** 8-byte big-endian unsigned (order-preserving for non-negative safe integers). */
export declare function encodeU64(n: number, out: Uint8Array, off: number): void;
export declare function decodeU64(buf: Uint8Array, off: number): number;
/** Order-preserving 8-byte encoding of an IEEE-754 double. */
export declare function encodeF64(x: number, out: Uint8Array, off: number): void;
export declare function decodeF64(buf: Uint8Array, off: number): number;
export declare function uuidToBytes(u: string): Uint8Array;
export declare function bytesToUuid(b: Uint8Array, off?: number): string;
/**
 * Encode a tagged value into an order-preserving byte string:
 *   [tag byte][payload]
 * Lexicographic comparison of the output (shorter-prefix-first) matches
 * `compareValue`. Note this is a *standalone* value encoding — when embedded
 * in a composite key it must be length-prefixed or terminated (segments do
 * the former); tree keys are compared structurally so that never matters.
 */
export declare function encodeValue(vt: ValueTag, v: DatomValue): Uint8Array;
/** Inverse of `encodeValue`. */
export declare function decodeValue(buf: Uint8Array): TaggedValue;
/**
 * Infer a value tag from a plain JS value (used when no schema attribute is
 * available to decide, e.g. `[?e ?a 42]`). numbers → long (or double if
 * non-integer), strings → string (uuid if it looks like one? no — explicit),
 * booleans → bool, Date → inst, Uint8Array → bytes, bigint → long.
 */
export declare function inferTag(v: unknown): TaggedValue;
/** Convert a stored payload back into an idiomatic JS value (Date for inst). */
export declare function toJsValue(vt: ValueTag, v: DatomValue): unknown;
/** Stable string key for hashing a value in joins / sets. */
export declare function valueKey(vt: ValueTag, v: DatomValue): string;
//# sourceMappingURL=datom.d.ts.map