/**
 * Session log walk: what one principal may hear about one committed tx.
 *
 * The replica stays unfiltered. This is the sieve applied after the replica
 * applies a frame (`applyDatoms`), before a `{ op: "tx" }` / `{ op: "resync" }`
 * leaves toward the browser. A fully-filtered data tx is silence (no `t` leak). A
 * membership/owner change that flips this principal's access to other facts
 * is `resync`. A peer-visible create or update (no grant change on existing
 * facts) is `{ op: "tx" }`, not a view reload.
 */
import { type CompiledPolicy, type Datom, type Db, type Principal, type WireDatom } from "../internal/core/index.ts";
export type SessionTxKind = "skip" | "tx" | "resync";
/** A `tx` decision must carry the sieved facts — never fall back to the replica entry. */
export type SessionTxDecision = {
    readonly kind: "skip";
} | {
    readonly kind: "resync";
} | {
    readonly kind: "tx";
    readonly datoms: WireDatom[];
};
export interface SessionLogEntry {
    readonly t: number;
    readonly datoms: WireDatom[];
}
export interface SessionLog {
    readonly t: number;
    readonly rootT: number;
    readonly entries: readonly SessionLogEntry[];
}
/** Every ident a rule reads via `eq` or `ref` — the grant attributes. */
export declare function grantIdents(policy: CompiledPolicy): Set<string>;
/**
 * Did this tx change what `principal` can read *beyond the facts in this tx*?
 *
 * A grant/revoke of membership or owner on an entity that already existed
 * hides or reveals historical facts that are not in the entry → `resync`.
 * Creating a new readable entity (Ada's own doc, an in-org add Bea can see)
 * only introduces facts that are already in the entry → incremental `tx`.
 */
export declare function ruleViewChanged(opts: {
    datoms: readonly Datom[];
    policy: CompiledPolicy;
    principal: Principal;
    ruleDbAfter: Db;
    ruleDbBefore: Db;
}): Promise<boolean>;
/**
 * One committed entry, judged after that commit.
 *
 * - no policy / superuser → every datom, as a `tx`
 * - rule-view change → `resync` (grant of membership, revoke-of-P, …)
 * - nothing visible → `skip` (the socket must not learn that `t` happened)
 * - else → `tx` with the kept facts
 */
export declare function decideSessionTx(opts: {
    datoms: readonly Datom[];
    policy?: CompiledPolicy;
    principal?: Principal;
    ruleDbAfter: Db;
    ruleDbBefore: Db;
}): Promise<SessionTxDecision>;
/** Current-value facts a principal may read — first sync / resync dump, no history. */
export declare function currentViewDatoms(db: Db): Promise<WireDatom[]>;
//# sourceMappingURL=session-sync.d.ts.map