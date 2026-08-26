/**
 * `useConnectionStatus` — `"connecting" | "live" | "reconnecting" |
 * "offline" | "closed"`, from the session the client already tracks.
 *
 * Provider-scoped (`useConnectionStatus()`) rolls up every session the
 * nearest client has opened. Per-db (`useConnectionStatus(db)`) reads
 * that database's session and needs no provider — the same rule as
 * `useLiveQuery(db, q)`.
 */
import type { ConnectionStatus, Schema, ReadDb } from "../db/index.ts";
/** Provider-scoped: the nearest client's rolled-up status. */
export declare function useConnectionStatus(): ConnectionStatus;
/** Per-db: that database's session. Needs no provider. */
export declare function useConnectionStatus<C extends Schema.Any>(db: ReadDb<C>): ConnectionStatus;
//# sourceMappingURL=useConnectionStatus.d.ts.map