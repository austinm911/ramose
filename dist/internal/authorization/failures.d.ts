import type { CatalogId, CatalogUnitHash, CatalogVersion, DatabaseId, SchemaFingerprint } from "./identities.ts";
export type IncompleteReason = {
    readonly _tag: "NotLoaded";
} | {
    readonly _tag: "InvalidTraversal";
} | {
    readonly _tag: "BudgetExhausted";
} | {
    readonly _tag: "MissingMe";
};
export declare const NotLoaded: {
    readonly _tag: "NotLoaded";
};
export declare const InvalidTraversal: {
    readonly _tag: "InvalidTraversal";
};
export declare const BudgetExhausted: {
    readonly _tag: "BudgetExhausted";
};
export declare const MissingMe: {
    readonly _tag: "MissingMe";
};
declare const InvalidIR_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "InvalidIR";
} & Readonly<A>;
export declare class InvalidIR extends InvalidIR_base<{
    readonly message: string;
}> {
}
declare const CatalogMismatch_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "CatalogMismatch";
} & Readonly<A>;
export declare class CatalogMismatch extends CatalogMismatch_base<{
    readonly message: string;
    readonly expected?: CatalogId;
    readonly actual?: CatalogId;
    readonly expectedVersion?: CatalogVersion;
    readonly actualVersion?: CatalogVersion;
    readonly expectedFingerprint?: SchemaFingerprint;
    readonly actualFingerprint?: SchemaFingerprint;
    readonly expectedDatabase?: DatabaseId;
    readonly actualDatabase?: DatabaseId;
}> {
}
declare const AuthorizationBudgetExceeded_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "AuthorizationBudgetExceeded";
} & Readonly<A>;
export declare class AuthorizationBudgetExceeded extends AuthorizationBudgetExceeded_base<{
    readonly message: string;
    readonly spent: number;
    readonly limit: number;
}> {
}
declare const AuthorizationDenied_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "AuthorizationDenied";
} & Readonly<A>;
export declare class AuthorizationDenied extends AuthorizationDenied_base {
}
export type AuthorizationFailure = InvalidIR | CatalogMismatch | AuthorizationBudgetExceeded | AuthorizationDenied;
declare const CatalogUnitCorrupt_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "CatalogUnitCorrupt";
} & Readonly<A>;
export declare class CatalogUnitCorrupt extends CatalogUnitCorrupt_base<{
    readonly message: string;
    readonly catalog: CatalogId;
}> {
}
declare const CatalogVersionMismatch_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "CatalogVersionMismatch";
} & Readonly<A>;
export declare class CatalogVersionMismatch extends CatalogVersionMismatch_base<{
    readonly catalog: CatalogId;
    readonly expected?: CatalogUnitHash;
    readonly actual?: CatalogUnitHash;
}> {
}
export {};
//# sourceMappingURL=failures.d.ts.map