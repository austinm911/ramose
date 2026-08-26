/**
 * Clause-level policy pushdown. A namespace read rule is conjoined onto each
 * entity var that touches that namespace, *before* planning, so visibility
 * rides the same indexes as the caller. Injected clauses are stamped
 * `origin: "rule"` and bind against the unfiltered rule db; caller clauses
 * stay on the filtered view. Conjunction is always in `:where` — never in
 * `:having` — so a count cannot include a row the caller could not see.
 *
 * FilteredDb remains the enforcement backstop for pull, history, raw datom
 * access, attr-level narrowing, and anything this rewrite does not cover.
 */
import { type CompiledPolicy } from "./ast.ts";
import { type Principal } from "./principal.ts";
import type { Db } from "../db.ts";
import { type Query, type RuleDef } from "../query/ast.ts";
/** Hygienic principal binding. Fresh-named if the caller already uses it. */
export declare const POLICY_ME_VAR = "?__ramose_me";
/**
 * The slice of a policy view pushdown needs. Structural so the query engine
 * can import this module without importing FilteredDb (eval → engine cycle).
 */
export interface PushdownView {
    readonly policy: CompiledPolicy;
    readonly principal: Principal;
    readonly ruleDb: Db;
    readonly memo: {
        enterPushdown(namespaces: readonly string[]): void;
        exitPushdown(namespaces: readonly string[]): void;
        skipsNsBackstop(ns: string | undefined): boolean;
    };
}
export interface PushdownResult {
    readonly query: Query;
    /** Bound to {@link Principal.eid} when a named rule was conjoined. */
    readonly meVar?: string;
    readonly meValue?: unknown;
    /**
     * Namespaces whose read rule was conjoined onto every top-level entity var
     * in that namespace. The executor may skip the ns-level FilteredDb check
     * for these during this query (attr-level narrowing still runs).
     */
    readonly covered: readonly string[];
}
/** Conjoin per-var namespace read rules. v1 / admin / `true` arms are a no-op. */
export declare function conjoinPolicy(ast: Query, view: PushdownView): PushdownResult;
export declare function parsePolicyRules(rules: readonly unknown[] | undefined): RuleDef[];
//# sourceMappingURL=pushdown.d.ts.map