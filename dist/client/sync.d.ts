/**
 * - `idle` — nothing has been observed yet, so nothing synchronizes. This is
 *   what a freshly constructed client reports; constructing handles is inert.
 * - `connecting` — an activation is in flight and no local value is readable.
 * - `live` — a local value is readable and the server has confirmed it.
 * - `stale` — a local value is readable but the current session has not
 *   confirmed it: a restored offline replica, or a reconnect in progress.
 * - `offline` — the activation could not reach the server. Whatever local value
 *   was already confirmed stays readable; nothing new is. Not a terminal state:
 *   the next time the tab is activated — focused, shown, restored from the
 *   back/forward cache, or told the device is online — it activates again.
 * - `update-required` — this client build is behind, and no retry helps; ship a
 *   new build. Two causes, and they differ in what stays readable. The server
 *   rotated the authorized view (a schema, trait, read-policy, or graph-read
 *   change): nothing is published, because this build cannot read what the
 *   server now serves. Or this build cannot replay its own durable optimistic
 *   layers: those layers are withheld, but the committed replica is untouched
 *   and stays readable, so queries keep answering from it without the pending
 *   work folded in.
 * - `authentication-required` — the credential was refused, or the principal
 *   behind it was replaced. There is no anonymous fallback and no other
 *   candidate: the prior partition is fenced and publishes nothing.
 * - `closed` — `close()` or `clearLocalData()` made this client terminal.
 */
export type SyncStatus = "idle" | "connecting" | "live" | "stale" | "offline" | "update-required" | "authentication-required" | "closed";
export type SyncState = {
    readonly status: SyncStatus;
};
export declare const syncState: (status: SyncStatus) => SyncState;
export declare const aggregateSyncStatus: (statuses: Iterable<SyncStatus>) => SyncStatus;
//# sourceMappingURL=sync.d.ts.map