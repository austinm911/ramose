/**
 * Raw `/transact` under a configured policy: schema stays
 * `schemaClasses`-gated, data is superuser-only. Per-datom write arms
 * are gone — named operations are the write surface.
 */
import {} from "./ast.js";
import { canChangeSchema, isSuperuser } from "./principal.js";
const deny = (attr, op) => ({ ok: false, code: "policy", attr, op });
/**
 * Every op is a map-form `ensure`: a `:db/ident` plus only `:db/*`
 * scalars. Extra app keys, nested maps, reverse refs, and `:db/id`
 * (which would aim the install at an existing entity) are not schema.
 * Empty `tx` is not schema (nothing to ensure).
 */
export function isSchemaTx(tx) {
    if (!Array.isArray(tx) || tx.length === 0)
        return false;
    for (const op of tx) {
        if (typeof op !== "object" || op === null || Array.isArray(op))
            return false;
        const m = op;
        if (typeof m[":db/ident"] !== "string")
            return false;
        if (m[":db/id"] !== undefined)
            return false;
        for (const [k, v] of Object.entries(m)) {
            if (!k.startsWith(":db/"))
                return false;
            const t = typeof v;
            if (t !== "string" && t !== "number" && t !== "boolean")
                return false;
        }
    }
    return true;
}
/**
 * Authoritative raw-transact check. Superuser may write data; schema
 * txs require `schemaClasses`. Everyone else is denied. Operation-
 * originated txs never reach this function.
 */
export async function checkTx(txData, _db, policy, principal, _schema) {
    const ops = txData;
    if (isSuperuser(principal, policy))
        return { ok: true, ops };
    if (isSchemaTx(txData) && canChangeSchema(principal, policy))
        return { ok: true, ops };
    return deny(":db/tx", "transact");
}
//# sourceMappingURL=check.js.map