import type { DomainViolation, StdlibValue, ValueType, ValueTypeName } from "./types.ts";
export declare const MAX_TIMESTAMP_MILLIS = 8640000000000000;
export declare const MAX_PRODUCED_TEXT_UNITS: number;
export declare const isWellFormedText: (value: string) => boolean;
export declare const classify: (value: StdlibValue) => ValueTypeName;
export declare const isFiniteNumber: (value: StdlibValue) => value is number;
export declare const isTimestamp: (value: StdlibValue) => value is number;
export declare const matchesValueType: (value: StdlibValue, type: ValueType) => boolean;
export declare const domainViolation: (value: StdlibValue) => DomainViolation | undefined;
export declare const deepEquals: (left: StdlibValue, right: StdlibValue) => boolean;
export declare const canonicalKey: (value: StdlibValue) => string;
export declare const codePoints: (text: string) => readonly string[];
export declare const clampIndex: (index: number, length: number) => number;
export declare const asciiLower: (value: string) => string;
export declare const asciiUpper: (value: string) => string;
export declare const trimPinned: (value: string) => string;
//# sourceMappingURL=values.d.ts.map