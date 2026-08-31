export declare class ByteWriter {
    private buf;
    private view;
    pos: number;
    constructor(initial?: number);
    private ensure;
    u8(x: number): void;
    u32(x: number): void;
    uvar(x: number): void;
    svar(x: number): void;
    f64(x: number): void;
    bytes(b: Uint8Array): void;
    lbytes(b: Uint8Array): void;
    str(s: string): void;
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
export declare function sha256Hex(data: Uint8Array): Promise<string>;
export declare function gzip(data: Uint8Array): Promise<Uint8Array>;
export declare function gunzip(data: Uint8Array): Promise<Uint8Array>;
//# sourceMappingURL=bytes.d.ts.map