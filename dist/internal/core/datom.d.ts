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
export type DatomValue = number | string | boolean | Uint8Array;
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
    readonly op: boolean;
}
export declare function datom(e: number, a: number, vt: ValueTag, v: DatomValue, t: number, op?: boolean): Datom;
export declare const MAX_ID: number;
export declare function normalizeValue(vt: ValueTag, v: DatomValue): DatomValue;
export declare function compareStrings(a: string, b: string): number;
export declare function compareBytes(a: Uint8Array, b: Uint8Array): number;
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
export declare function datomEquals(x: Datom, y: Datom): boolean;
export interface Prefix {
    readonly e?: number;
    readonly a?: number;
    readonly vt?: ValueTag;
    readonly v?: DatomValue;
    readonly t?: number;
}
export declare function comparePrefix(index: IndexId, d: Datom, p: Prefix): number;
export declare function prefixDepth(index: IndexId, p: Prefix): number;
export declare const INDEX_ORDER: Record<IndexId, readonly ("e" | "a" | "v" | "t")[]>;
export declare function encodeI64(n: number | bigint, out: Uint8Array, off: number): void;
export declare function decodeI64(buf: Uint8Array, off: number): bigint;
export declare function encodeU64(n: number, out: Uint8Array, off: number): void;
export declare function decodeU64(buf: Uint8Array, off: number): number;
export declare function encodeF64(x: number, out: Uint8Array, off: number): void;
export declare function decodeF64(buf: Uint8Array, off: number): number;
export declare function uuidToBytes(u: string): Uint8Array;
export declare function bytesToUuid(b: Uint8Array, off?: number): string;
export declare function encodeValue(vt: ValueTag, v: DatomValue): Uint8Array;
export declare function decodeValue(buf: Uint8Array): TaggedValue;
export declare function inferTag(v: unknown): TaggedValue;
export declare function toJsValue(vt: ValueTag, v: DatomValue): unknown;
export declare function valueKey(vt: ValueTag, v: DatomValue): string;
//# sourceMappingURL=datom.d.ts.map