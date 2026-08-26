/**
 * Rule evaluation. Rules read the *unfiltered* db at the rule basis — a rule
 * must follow `:doc/owner` even when the caller cannot read it. Results are
 * memoized per (expr, e), per (rule, e), and per (op, attr, e) for one request.
 *
 * v2 fragment arms run as one engine query against that unfiltered rule db
 * (never the filtered view). On the read path, a named rule is evaluated
 * once with the focus free — "all `e` visible to `me`" — and the per-datom
 * check is a set-membership lookup. The same query with `?e` bound is the
 * per-entity fallback when the set is too large or blows the cell budget.
 * Query pushdown (#157) conjoins the same rule into the caller's plan; this
 * evaluator stays the enforcement backstop. Pushdown is not required for
 * correctness.
 */
import { Db } from "../db.ts";
import { QueryBudgetError } from "../query/engine.ts";
import type { Query } from "../query/ast.ts";
import { type CompiledPolicy, type PolicyExpr, type PolicyOp } from "./ast.ts";
import { type Principal } from "./principal.ts";
/** Bootstrap `:db/*` attributes: schema and tx metadata are not secret. */
export declare function isSystemAttrId(a: number): boolean;
export interface PolicyError {
    readonly _tag: "PolicyError";
    readonly reason: "unknown-attr" | "not-a-ref";
    readonly attr: string;
    readonly message: string;
}
/**
 * A fragment rule blew the query memory budget. This is a deploy-time smell
 * (the rule is too expensive), not a deny — the read/write fails as an
 * error so it cannot be mistaken for "not visible".
 */
export declare class PolicyBudgetError extends QueryBudgetError {
    readonly rule: string;
    readonly code = "policy/budget-exceeded";
    constructor(rule: string, cause: QueryBudgetError);
}
/** Refs asserted by the tx under check: `${e}|${attrId}` → target eids. */
export type RefOverlay = ReadonlyMap<string, readonly number[]>;
/**
 * Cap on eids a request-scoped visible set may hold. Above this, that rule
 * falls back to per-entity evaluation for the rest of the request — the
 * signal that clause-level pushdown has a workload.
 */
export declare const DEFAULT_VISIBLE_SET_MAX = 10000;
export interface PolicyMemoOptions {
    readonly maxCells?: number;
    /** `0` disables set materialization (the #154 per-entity path). */
    readonly visibleSetMax?: number;
}
export type VisibleSetFallbackReason = "size" | "budget";
export interface VisibleSetFallback {
    readonly rule: string;
    readonly reason: VisibleSetFallbackReason;
    readonly size?: number;
}
export type VisibleSetState = {
    readonly _tag: "set";
    readonly eids: ReadonlySet<number>;
} | {
    readonly _tag: "fallback";
};
export declare class PolicyMemo {
    readonly maxCells: number;
    readonly visibleSetMax: number;
    private readonly exprIds;
    private nextExprId;
    private readonly exprCache;
    private readonly ruleCache;
    private readonly ruleQueries;
    private readonly setQueries;
    private readonly visibleSets;
    private readonly fallbacks;
    private readonly opCache;
    private readonly errs;
    private overlayDb;
    /** Refcount of namespaces whose read rule is in the current query's plan. */
    private readonly nsBackstopSkip;
    constructor(maxCellsOrOpts?: number | PolicyMemoOptions);
    /** Times this request fell back to per-entity evaluation for a named rule. */
    get visibleSetFallbackCount(): number;
    get visibleSetFallbacks(): readonly VisibleSetFallback[];
    visibleSet(name: string): VisibleSetState | undefined;
    /**
     * During a pushdown query, skip the namespace-level FilteredDb check for
     * these namespaces (the rule is already in the plan). Attr-level narrowing
     * still runs. Refcounted so nested `q` calls compose.
     */
    enterPushdown(namespaces: readonly string[]): void;
    exitPushdown(namespaces: readonly string[]): void;
    skipsNsBackstop(ns: string | undefined): boolean;
    /** Idents that folded to `false` because they are not in the installed schema. */
    get errors(): readonly PolicyError[];
    report(reason: PolicyError["reason"], attr: string, message: string): void;
    exprId(expr: PolicyExpr): number;
    getExpr(key: string): boolean | undefined;
    setExpr(key: string, v: boolean): boolean;
    getOp(key: string): boolean | undefined;
    setOp(key: string, v: boolean): boolean;
    getRule(key: string): boolean | undefined;
    setRule(key: string, v: boolean): boolean;
    /** Parsed existence query for `name`, shared across (e) evaluations. */
    ruleQuery(name: string, rules: readonly unknown[]): Query;
    /**
     * Same rule as {@link ruleQuery}, with `?e` free. `limit` is the size
     * threshold plus one so a blow is visible without holding an unbounded set.
     */
    setQuery(name: string, rules: readonly unknown[]): Query;
    recordVisibleSet(name: string, eids: ReadonlySet<number>): void;
    recordVisibleSetFallback(name: string, reason: VisibleSetFallbackReason, size?: number): void;
    /** One overlay view per memo — create arms share the same in-tx refs. */
    overlayView(db: Db, overlay: RefOverlay): Db;
}
export interface EvalCtx {
    /** unfiltered rule view at the current basis */
    readonly db: Db;
    readonly principal: Principal;
    /** the entity being judged */
    readonly e: number;
    readonly memo: PolicyMemo;
    /** only set while checking `create` arms */
    readonly overlay?: RefOverlay;
    /** override the memo's query-cell budget for this evaluation */
    readonly maxCells?: number;
}
export declare function evalExpr(expr: PolicyExpr, ctx: EvalCtx): Promise<boolean>;
/**
 * Is `op` allowed on attribute `attrIdent` at `ctx.e`? The attribute rule
 * ANDs with (only narrows) its namespace rule; either alone applies; neither
 * denies.
 */
export declare function allowsOp(policy: CompiledPolicy, op: PolicyOp, attrIdent: string, ctx: EvalCtx): Promise<boolean>;
export declare function canRead(policy: CompiledPolicy, attrIdent: string, ctx: EvalCtx): Promise<boolean>;
/**
 * True when any arm on `name` needs a resolved `on` target (named v2
 * rule or db-dependent v1 expr). A bare (no-`on`) op cannot evaluate
 * those arms — callers must deny.
 */
export declare function operationHasTargetArm(policy: CompiledPolicy, name: string): boolean;
export declare function operationClassAllows(policy: CompiledPolicy, name: string, principal: Principal): boolean;
/**
 * Full operation check: class gate, then a named rule against `ctx.e`
 * (the resolved target). Arms with `rule: true` pass on the class gate
 * alone. No arms → deny.
 */
export declare function allowsOperation(policy: CompiledPolicy, name: string, ctx: EvalCtx): Promise<boolean>;
/**
 * Unfiltered db plus the refs this tx asserts. Create arms follow a parent
 * that exists only in the proposed datoms; add/retract/read never see this.
 */
export declare function withRefOverlay(db: Db, overlay: RefOverlay): Db;
//# sourceMappingURL=eval.d.ts.map