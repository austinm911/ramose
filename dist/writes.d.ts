export type WritesMode = "all" | "operations";
export declare const WRITES_ENV_KEY: "RAMOSE_WRITES";
export declare const WRITES_HEADER = "x-ramose-writes";
export declare const isWritesMode: (value: unknown) => value is WritesMode;
export declare const resolveWrites: (writes: WritesMode | undefined, envWrites: unknown) => WritesMode;
export declare const parseWritesHeader: (raw: string | null | undefined) => WritesMode | undefined;
export declare const isUnrecognizedWrites: (envWrites: unknown) => boolean;
//# sourceMappingURL=writes.d.ts.map