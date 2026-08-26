/** The compiled policy AST: plain, versioned JSON. Reads attach to attributes / namespaces; writes attach to named operations. Nothing matching = deny. */
/** Current wire version: fragment arms + a query `rules` section. */
export declare const POLICY_VERSION = 2;
/** Expression-arm policies compiled before fragment rules. Still parsed. */
export declare const POLICY_LEGACY_VERSION = 1;
/** Max nesting of `ref` arrows in one v1 expression. */
export declare const MAX_REF_DEPTH = 3;
/** Per-datom / per-namespace verbs. Writes moved to {@link CompiledPolicy.operations}. */
export type PolicyOp = "read";
export declare const POLICY_OPS: readonly PolicyOp[];
/** Denial / toast spelling. Write verbs are gone; the name is kept for read denials. */
export declare const publicPolicyOp: (op: string) => string;
/** Path into `Principal.claims`, e.g. ["sub"] or ["attrs", "org"]. */
export type ClaimPath = readonly string[];
export type PolicyOperand = 
/** the principal's resolved entity id */
{
    readonly _tag: "principal";
} | {
    readonly _tag: "claim";
    readonly path: ClaimPath;
} | {
    readonly _tag: "lit";
    readonly value: unknown;
};
export type PolicyExpr = {
    readonly _tag: "const";
    readonly value: boolean;
}
/** folds to a constant per session; reads nothing */
 | {
    readonly _tag: "class";
    readonly class: string;
}
/** a datom [e attr operand] exists; on cardinality-many this is membership */
 | {
    readonly _tag: "eq";
    readonly attr: string;
    readonly operand: PolicyOperand;
}
/** follow [e attr ?x] and evaluate `target` at each ?x */
 | {
    readonly _tag: "ref";
    readonly attr: string;
    readonly target: PolicyExpr;
} | {
    readonly _tag: "and";
    readonly exprs: readonly PolicyExpr[];
} | {
    readonly _tag: "or";
    readonly exprs: readonly PolicyExpr[];
} | {
    readonly _tag: "not";
    readonly expr: PolicyExpr;
};
/** v1 expression arm. */
export interface PolicyExprArm {
    readonly _tag: "allow" | "deny";
    readonly expr: PolicyExpr;
}
/**
 * v2 fragment arm. `class` is a JWT claims gate (checked before the rule).
 * `rule: true` is the empty/public fragment; a string names a rule in `rules`.
 */
export interface PolicyRuleArm {
    readonly _tag: "allow";
    readonly class?: readonly string[];
    readonly rule: true | string;
}
export type PolicyArm = PolicyExprArm | PolicyRuleArm;
export declare const isRuleArm: (arm: PolicyArm) => arm is PolicyRuleArm;
/**
 * True when `expr` reads the entity (`eq` / `ref`, or a composite that
 * contains one). Class / const folds are session-constant and do not
 * need a resolved `on` target.
 */
export declare function exprNeedsTarget(expr: PolicyExpr): boolean;
/**
 * True when an arm needs a resolved `on` target: a named v2 rule, or a
 * v1 expression that reads the entity. `rule: true` is the class-only
 * (public) fragment and does not.
 */
export declare function armNeedsTarget(arm: PolicyArm): boolean;
/**
 * Wire / unparsed form of {@link armNeedsTarget}. Used by the Server
 * deploy check, which inspects `RAMOSE_POLICY` JSON without requiring a
 * fully valid policy document.
 */
export declare function wireArmNeedsTarget(arm: unknown): boolean;
/** True when any arm in a wire `operations` entry needs an `on` target. */
export declare function wireOperationNeedsTarget(arms: unknown): boolean;
/** Arms per op. Allow arms OR; any true deny wins; no arms → deny. */
export type PolicyRules = {
    readonly [K in PolicyOp]?: readonly PolicyArm[];
};
export type AttrRules = PolicyRules;
export interface CompiledPolicy {
    readonly version: 1 | 2;
    /** attribute ident whose value is the JWT `sub`, e.g. ":user/sub" */
    readonly principal: string;
    readonly classes: readonly string[];
    /**
     * Class whose holders bypass every rule. Absent = no bypass.
     * Standing is resolved via {@link classesOf}, not this string vs `p.class`.
     */
    readonly superuser?: string;
    /**
     * Classes that may install or grow schema. Defaults to `[superuser]`
     * when that field is set. Distinct from bypass.
     */
    readonly schemaClasses?: readonly string[];
    /** shape of `ramose.attrs`; opaque to core (Effect Schema JSON in alchemy) */
    readonly claims?: unknown;
    readonly attrs: Readonly<Record<string, AttrRules>>;
    /** namespace prefix (no leading ':') → fallback rules */
    readonly ns?: Readonly<Record<string, PolicyRules>>;
    /**
     * Wire operation name → allow arms. Deny-by-default: a registered op
     * with no entry is refused for everyone but the superuser.
     */
    readonly operations?: Readonly<Record<string, readonly PolicyArm[]>>;
    /**
     * Query-engine rule definitions (`[[name, ?me, ?e], clause…]`), present
     * on version 2 when any arm names a fragment rule.
     */
    readonly rules?: readonly unknown[];
}
export declare const PolicyAst: {
    readonly const: (value: boolean) => PolicyExpr;
    readonly class: (c: string) => PolicyExpr;
    readonly eq: (attr: string, operand: PolicyOperand) => PolicyExpr;
    readonly ref: (attr: string, target: PolicyExpr) => PolicyExpr;
    readonly and: (...exprs: PolicyExpr[]) => PolicyExpr;
    readonly or: (...exprs: PolicyExpr[]) => PolicyExpr;
    readonly not: (expr: PolicyExpr) => PolicyExpr;
    readonly allow: (expr: PolicyExpr) => PolicyExprArm;
    readonly deny: (expr: PolicyExpr) => PolicyExprArm;
    readonly principal: PolicyOperand;
    readonly claim: (...path: string[]) => PolicyOperand;
    readonly lit: (value: unknown) => PolicyOperand;
};
/** ":doc/title" → "doc"; undefined when the ident has no namespace. */
export declare function nsPrefix(ident: string): string | undefined;
export declare class PolicyParseError extends Error {
    constructor(message: string);
}
/** Decode + validate a compiled policy. Throws `PolicyParseError` when bad. */
export declare function parsePolicy(json: unknown): CompiledPolicy;
//# sourceMappingURL=ast.d.ts.map