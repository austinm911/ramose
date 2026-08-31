import { type Datom } from "./datom.ts";
import { Db } from "./db.ts";
import type { CompositionIndex } from "./composition.ts";
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
export interface TxOp {
    kind: "add" | "update" | "retract" | "retractEntity" | "cas";
    e: EForm;
    a?: string | number;
    v?: unknown;
    expected?: unknown;
    hasV?: boolean;
    engineTypeAssertion?: boolean;
}
export interface ExpandedOp {
    readonly kind: "add" | "retract";
    readonly e: number;
    readonly a: number;
    readonly attr: Attribute;
    readonly datom: Datom;
    readonly implicit: boolean;
    readonly fromRetractEntity: boolean;
    readonly retractEntityRoot: boolean;
    readonly engineTypeAssertion: boolean;
}
export interface TxExpansion extends TxResult {
    newEntities: Set<number>;
    ops: ExpandedOp[];
}
export interface ExpandOptions {
    closureCap?: number;
    composition?: CompositionIndex;
}
export declare const GENERATED_TEMPID_PREFIX = "__ramose.tmp/";
export declare function flattenTxData(txData: TxData): TxOp[];
export declare function processTx(db: Db, txData: TxData, t: number, nextEid: number, txInstant: number, options?: ExpandOptions): Promise<TxResult>;
export declare function expandTx(db: Db, txData: TxData, t: number, nextEid: number, txInstant: number, options?: ExpandOptions): Promise<TxExpansion>;
export {};
//# sourceMappingURL=tx.d.ts.map