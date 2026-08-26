/**
 * Transaction processing — pure: (db, txData, t) → datoms.
 *
 * Used both by the in-memory `Connection` (M1) and the Transactor DO (M2);
 * it never touches storage directly, only reads through `Db`.
 *
 * Tx data forms (attribute names are ident strings, e.g. ":user/name"):
 *   [":db/add", e, a, v]
 *   [":db/update", e, a, v]              (never creates; missing subject rejects)
 *   [":db/update", e]                    (existence ping; no write)
 *   [":db/retract", e, a, v?]            (v omitted → retract all values)
 *   [":db/retractEntity", e]             (also retracts refs to e; components recursively)
 *   { ":db/id": e?, ":user/name": "Bob", ":user/friends": [ref, ...], ":user/_friends": [ref] }
 *
 * Entity forms: eid (number) | ident (":..." string) | tempid (other string)
 *   | lookup ref [":attr", value] | nested map (in ref-valued position)
 *   | ":db/tx" (the current transaction entity).
 *
 * Semantics (Datomic-inspired):
 *   - tempids sharing a :db.unique/identity value with an existing entity upsert
 *   - cardinality-one asserts retract the previous value implicitly
 *   - redundant asserts / retracts of absent facts are elided
 *   - :db.unique/value conflicts throw
 */
import { type Datom } from "./datom.ts";
import { Db } from "./db.ts";
import { type Attribute } from "./schema.ts";
export declare class TxError extends Error {
    readonly code: string;
    constructor(msg: string, code?: string);
}
export type TxData = unknown[];
export interface TxResult {
    t: number;
    txEid: number;
    datoms: Datom[];
    tempids: Record<string, number>;
    nextEid: number;
}
type EForm = number | string | unknown[];
/** A tx item after map/reverse-ref expansion, before entity/value resolution. */
export interface TxOp {
    kind: "add" | "update" | "retract" | "retractEntity";
    e: EForm;
    a?: string | number;
    v?: unknown;
    hasV?: boolean;
}
/**
 * One concrete datom the tx will produce, with the provenance a policy check
 * needs: which resolved entity/attribute it lands on and why it exists.
 */
export interface ExpandedOp {
    readonly kind: "add" | "retract";
    readonly e: number;
    readonly a: number;
    readonly attr: Attribute;
    readonly datom: Datom;
    /** retract emitted by cardinality-one replacement */
    readonly implicit: boolean;
    /** retract emitted by a :db/retractEntity closure */
    readonly fromRetractEntity: boolean;
}
export interface TxExpansion extends TxResult {
    /** entity ids this tx allocates (never seen before), plus the tx entity */
    newEntities: Set<number>;
    /** the concrete per-datom ops, in emission order (tx-instant excluded) */
    ops: ExpandedOp[];
}
export interface ExpandOptions {
    /** max datoms a :db/retractEntity closure may produce before throwing */
    closureCap?: number;
}
/** Prefix of tempids generated for map forms without an explicit `:db/id`. */
export declare const GENERATED_TEMPID_PREFIX = "__ramose.tmp/";
/**
 * Expand map forms into add ops. Returns the flat op list. Generated tempids
 * are numbered per call, so flattening the same tx data twice yields the same
 * names (the policy pre-check relies on it).
 */
export declare function flattenTxData(txData: TxData): TxOp[];
/**
 * Process a transaction against `db`, producing the datoms for tx `t`.
 * `nextEid` is the first free entity id; the returned `nextEid` accounts for
 * allocations. `txInstant` is epoch ms.
 */
export declare function processTx(db: Db, txData: TxData, t: number, nextEid: number, txInstant: number): Promise<TxResult>;
/**
 * `processTx` plus the per-datom provenance the policy layer checks against.
 * Same semantics — `processTx` is a projection of this.
 */
export declare function expandTx(db: Db, txData: TxData, t: number, nextEid: number, txInstant: number, options?: ExpandOptions): Promise<TxExpansion>;
export {};
//# sourceMappingURL=tx.d.ts.map