/**
 * `usePrincipal(db)` — who this session is, as the peer reports it.
 *
 * `db.principal()` is already cached per session generation, so the hook
 * is thin: load on mount / view change, re-read when the session
 * generation advances (reconnect / new socket). `{ eid, class, loading }`
 * — `eid` is `null` until the principal row exists, `undefined` while
 * the first read is in flight.
 */
import type { Schema, Db, DbError, Eid } from "../db/index.ts";
export interface Principal<C extends Schema.Any = Schema.Any> {
    /** Catalog-branded eid, or `null` when the principal row does not exist yet. */
    readonly eid: Eid<C> | null | undefined;
    readonly class: string | undefined;
    readonly loading: boolean;
}
export declare const usePrincipal: <C extends Schema.Any>(db: Db<C>, options?: {
    onError?: (error: DbError) => void;
}) => Principal<C>;
//# sourceMappingURL=usePrincipal.d.ts.map