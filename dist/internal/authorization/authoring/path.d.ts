import type { PathCarrier } from "../../../db/shapes.ts";
import { type AuthOperandInput, type AuthPathLike, type AuthPathProxy, type AuthPathStep } from "./types.ts";
declare class AuthPath implements AuthPathLike {
    readonly _tag: "AuthPath";
    readonly steps: readonly AuthPathStep[];
    constructor(steps: readonly AuthPathStep[]);
    eq(rhs: AuthOperandInput): import("./types.ts").AuthExpr;
    contains(rhs: AuthOperandInput): import("./types.ts").AuthExpr;
}
export type { AuthPathLike as AuthPath };
export declare const $: <N extends {
    readonly fields: object;
    readonly ns?: string;
    readonly id?: unknown;
}>(root: N) => AuthPathProxy<N["fields"]>;
export declare const path: (...hops: ReadonlyArray<AuthPathLike | {
    readonly ident: string;
}>) => AuthPath;
export declare const seededPath: (field: PathCarrier) => AuthPathProxy;
//# sourceMappingURL=path.d.ts.map