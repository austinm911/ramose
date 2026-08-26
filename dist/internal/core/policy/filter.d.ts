/** The filtered `Db`: drops datoms at the raw-access points (`datoms` / `seekMany` / `first`); `estimate` stays unfiltered. */
import type { Datom, IndexId, Prefix } from "../datom.ts";
import { Db, type DbOptions } from "../db.ts";
import type { CompiledPolicy } from "./ast.ts";
import { PolicyMemo } from "./eval.ts";
import { type Principal } from "./principal.ts";
export interface PolicyView {
    readonly policy: CompiledPolicy;
    readonly principal: Principal;
    /** always the *current* unfiltered db, whatever the data view's asOf/history */
    readonly ruleDb: Db;
    readonly memo: PolicyMemo;
}
export declare class FilteredDb extends Db {
    readonly view: PolicyView;
    constructor(o: DbOptions, view: PolicyView);
    asOf(t: number): Db;
    history(): Db;
    datoms(index: IndexId, prefix: Prefix): AsyncGenerator<Datom[], void, undefined>;
    seekMany(index: IndexId, prefixes: readonly Prefix[]): Promise<Datom[][]>;
    first(index: IndexId, prefix: Prefix): Promise<Datom | undefined>;
    /**
     * Is `[e a …]` readable? Bootstrap `:db/*` datoms always are.
     * Named-rule membership is a set lookup once `PolicyMemo` has materialized
     * the request-scoped visible set. Query pushdown may skip the namespace
     * check when that rule is already in the plan; `allowsOp` remains the
     * enforcement backstop for pull, history, raw access, and attr narrowing.
     */
    visible(d: Datom): Promise<boolean>;
    private keep;
    /** Never yields an empty chunk: callers treat the first chunk as non-empty. */
    private sieve;
}
/**
 * A read-filtered view of `db`. `ruleDb` is the unfiltered db at the *current*
 * basis: an as-of or history data view is still judged by current grants, so a
 * retracted grant cannot re-grant through history.
 */
export declare function filterDb(db: Db, ruleDb: Db, policy: CompiledPolicy, principal: Principal, opts?: {
    readonly maxCells?: number;
    readonly visibleSetMax?: number;
}): Db;
/** The policy view behind a filtered db (undefined for an unfiltered one). */
export declare function policyView(db: Db): PolicyView | undefined;
//# sourceMappingURL=filter.d.ts.map