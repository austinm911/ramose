import type { AnyOwnedOperation } from "../../../db/Operation.ts";
import type { AuthExpr, InvokeRule } from "./types.ts";
export type InvokeBuilder = {
    readonly when: (expr: AuthExpr) => InvokeRule;
    readonly deny: (expr: AuthExpr) => InvokeRule;
};
export declare const invoke: (target: AnyOwnedOperation) => InvokeBuilder;
//# sourceMappingURL=invoke.d.ts.map