/**
 * Small growable byte writer / reader with LEB128 varints. Shared by the
 * segment and directory-node codecs. Pure TS.
 */
export declare class ByteWriter {
    private buf;
    private view;
    pos: number;
    constructor(initial?: number);
    private ensure;
    u8(x: number): void;
    u32(x: number): void;
    /** unsigned LEB128; supports safe integers (up to 2^53). */
    uvar(x: number): void;
    /**
     * zig-zag signed varint over the full safe-integer range.
     * Wire format is identical to LEB128 of zigzag(x) = 2|x| - neg, but computed
     * without ever materialising 2|x| (which overflows 2^53 for |x| > 2^52):
     * first byte carries the sign bit + 6 magnitude bits, remainder is uvar.
     */
    svar(x: number): void;
    f64(x: number): void;
    bytes(b: Uint8Array): void;
    /** length-prefixed bytes */
    lbytes(b: Uint8Array): void;
    str(s: string): void;
    /** Reserve `n` bytes at the current position; returns offset for later patch. */
    reserve(n: number): number;
    patchU32(off: number, x: number): void;
    finish(): Uint8Array;
}
export declare class ByteReader {
    readonly buf: Uint8Array;
    pos: number;
    private view;
    constructor(buf: Uint8Array, pos?: number);
    get remaining(): number;
    u8(): number;
    u32(): number;
    uvar(): number;
    svar(): number;
    f64(): number;
    bytes(n: number): Uint8Array;
    lbytes(): Uint8Array;
    str(): string;
}
export declare function concatBytes(parts: Uint8Array[]): Uint8Array;
export declare function bytesEqual(a: Uint8Array, b: Uint8Array): boolean;
export declare function toHex(b: Uint8Array): string;
export declare function fromHex(h: string): Uint8Array;
/** SHA-256 hex digest via WebCrypto (available in Bun, Node ≥ 19, Workers). */
export declare function sha256Hex(data: Uint8Array): Promise<string>;
/** gzip via the standard CompressionStream (Bun, Node ≥ 18, Workers). */
export declare function gzip(data: Uint8Array): Promise<Uint8Array>;
/** Rejects (never crashes) on truncated / corrupt input. */
export declare function gunzip(data: Uint8Array): Promise<Uint8Array>;
//# sourceMappingURL=bytes.d.ts.map