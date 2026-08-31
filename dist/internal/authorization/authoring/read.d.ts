import { type AuthExpr, type AuthPathProxy, type FieldTargetFields, type ReadRule } from "./types.ts";
export type ReadBuilder<Proxy> = {
    readonly when: (expr: AuthExpr | ((proxy: Proxy) => AuthExpr)) => ReadRule;
    readonly deny: (expr: AuthExpr | ((proxy: Proxy) => AuthExpr)) => ReadRule;
};
export declare function read<N extends {
    readonly _tag: "Entity" | "Trait";
    readonly fields: object;
}>(target: N): ReadBuilder<AuthPathProxy<N["fields"]>>;
export declare function read<F extends {
    readonly ident: string;
}>(target: F): ReadBuilder<AuthPathProxy<FieldTargetFields<F>>>;
//# sourceMappingURL=read.d.ts.map