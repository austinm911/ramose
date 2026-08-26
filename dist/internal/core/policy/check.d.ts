/**
 * Raw `/transact` under a configured policy: schema stays
 * `schemaClasses`-gated, data is superuser-only. Per-datom write arms
 * are gone — named operations are the write surface.
 */
import type { TxData } from "../tx.ts";
import type { Db } from "../db.ts";
import type { Schema } from "../schema.ts";
import { type CompiledPolicy } from "./ast.ts";
import { type Principal } from "./principal.ts";
/** Never carries values or eids. */
export interface PolicyDenied {
    readonly ok: false;
    readonly code: "policy";
    readonly attr: string;
    readonly op: string;
}
export type CheckTxResult = {
    readonly ok: true;
    readonly ops: unknown[];
} | PolicyDenied;
/**
 * Every op is a map-form `ensure`: a `:db/ident` plus only `:db/*`
 * scalars. Extra app keys, nested maps, reverse refs, and `:db/id`
 * (which would aim the install at an existing entity) are not schema.
 * Empty `tx` is not schema (nothing to ensure).
 */
export declare function isSchemaTx(tx: unknown): tx is readonly Record<string, unknown>[];
/**
 * Authoritative raw-transact check. Superuser may write data; schema
 * txs require `schemaClasses`. Everyone else is denied. Operation-
 * originated txs never reach this function.
 */
export declare function checkTx(txData: TxData, _db: Db, policy: CompiledPolicy, principal: Principal, _schema?: Schema): Promise<CheckTxResult>;
//# sourceMappingURL=check.d.ts.map