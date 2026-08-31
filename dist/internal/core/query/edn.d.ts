export declare class EdnList {
    readonly items: unknown[];
    constructor(items: unknown[]);
}
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
export declare function readEdnAll(src: string): unknown[];
export declare function printEdn(v: unknown): string;
//# sourceMappingURL=edn.d.ts.map