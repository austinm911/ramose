/**
 * `useSyncState` — the session's synchronization state as component state.
 */
import type { Client, ClientDatabase, SyncState } from "../client/index.ts";
/**
 * The replacement for `useBasis`. There is no basis to read any more: the
 * client answers queries from a local replica, so what a renderer needs is not
 * "how far has the server got" but "can I trust what I am showing".
 *
 * A `Client` and a `ClientDatabase` both expose `sync`, so either works; with
 * neither, this falls back to the nearest provider's client.
 *
 * For a renderer, the statuses group three ways:
 *
 * - `live` — readable and server-confirmed.
 * - `stale` and `offline` — still readable. Do not blank the screen; these are
 *   confirmed local data with an unconfirmed session behind it, and `offline`
 *   retries on the next tab activation.
 * - `update-required`, `authentication-required`, `closed` — not retryable.
 *   Nothing this component does will clear them: ship a new build, re-authenticate,
 *   or build a new client, respectively.
 */
export declare function useSyncState(source?: Client | ClientDatabase): SyncState;
//# sourceMappingURL=useSyncState.d.ts.map