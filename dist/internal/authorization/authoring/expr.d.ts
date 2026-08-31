import { type AuthExpr, type AuthOperandInput, type BoxedOperand } from "./types.ts";
export declare const allow: {
    readonly _tag: "const";
    readonly value: true;
};
export declare const deny: {
    readonly _tag: "const";
    readonly value: false;
};
export declare const me: {
    readonly _tag: "me";
};
export declare const subject: {
    readonly _tag: "subject";
};
export declare const claim: (key: string) => BoxedOperand;
export declare const lit: (value: string | number | boolean | null) => BoxedOperand;
export declare const hasClass: (className: string) => AuthExpr;
export declare const all: (...exprs: readonly AuthExpr[]) => AuthExpr;
export declare const any: (...exprs: readonly AuthExpr[]) => AuthExpr;
export declare const not: (expr: AuthExpr) => AuthExpr;
export declare const boxOperand: (input: AuthOperandInput | unknown) => unknown;
export declare const eq: (left: AuthOperandInput | unknown, right: AuthOperandInput | unknown) => AuthExpr;
export declare const contains: (collection: AuthOperandInput | unknown, value: AuthOperandInput | unknown) => AuthExpr;
//# sourceMappingURL=expr.d.ts.map