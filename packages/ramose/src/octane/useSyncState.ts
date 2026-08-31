/**
 * `useSyncState` — the session's synchronization state as component state.
 */

import { useContext, useSyncExternalStore } from "octane";
import type {
  Client,
  ClientDatabase,
  Subscription,
  SyncState,
} from "../client/index.ts";
import { RamoseContext } from "./hooks.ts";
import { splitSlot, subSlot } from "./internal.ts";

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
export function useSyncState(source?: Client | ClientDatabase): SyncState;
export function useSyncState(
  // Both arguments are optional, so a compiled call site with no arguments
  // puts the slot in `source`'s position — which then reads as a client and
  // reports a missing provider. Counting from the end is the only exact way to
  // find it, and no argument this hook takes is a `symbol`.
  ...args: [source?: Client | ClientDatabase, slot?: symbol]
): SyncState {
  const [rest, slot] = splitSlot(args);
  const source = rest[0] as Client | ClientDatabase | undefined;
  const provided = useContext(RamoseContext);
  const sync: Subscription<SyncState> | undefined = (source ?? provided)?.sync;
  if (sync === undefined) {
    throw new Error(
      "useSyncState: no <RamoseProvider> above this component and no client " +
        "or database passed. Wrap your tree in <RamoseProvider client={…}> or " +
        "call useSyncState(client).",
    );
  }
  return useSyncExternalStore(
    sync.subscribe,
    sync.getSnapshot,
    sync.getSnapshot,
    subSlot(slot, "sync:store"),
  );
}
