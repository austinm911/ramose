/**
 * `ramose/octane` — [Octane](https://github.com/octanejs/octane) bindings for
 * Ramose. The same surface as `ramose/react`, named hooks, not a namespace:
 *
 * ```tsx
 * import { RamoseProvider, useDb, useQuery } from "ramose/octane";
 * ```
 *
 * `RamoseProvider` carries one `Client` for a subtree — the application
 * constructs it, typically once at module scope, and this provider neither
 * creates nor closes it. `useRamose()` hands it back, `useDb()` opens its
 * configured root, `useQuery` / `useSuspenseQuery` observe one query,
 * `useReceipt` follows one invocation from `db.mutate.…()`, `useSyncState`
 * reports where the session is, `useTransact()` runs Effect writes from event
 * handlers (works with or without the provider), and `errorMessage` is the
 * one-liner a toast wants.
 *
 * The query state machine, the observation cache and the suspense holds are
 * upstream's own, imported from `../react/` — those modules carry no React
 * import, and sharing them is what keeps the two bindings from drifting into
 * two different answers about what `stale` means.
 *
 * These are hand-written plain-`.ts` hooks, so they carry their own hook slots
 * (see `./internal.ts` and the `octane.hookSlots` field in `package.json`):
 * the slot octane's compiler appends at your call site is split off and
 * sub-keyed per composed hook. Nothing about that is visible from a `.tsrx`
 * component — call them exactly as you would call the React ones.
 *
 * Server rendering reads synchronously and subscribes to nothing: a query is
 * `pending` on the server and fills in after hydration, and
 * `useSuspenseQuery` never suspends outside a browser.
 */

export { RamoseProvider, type RamoseProviderProps } from "./RamoseProvider.ts";
export { useDb, useRamose } from "./hooks.ts";
export { useQuery, useSuspenseQuery } from "./useQuery.ts";
export { useReceipt } from "./useReceipt.ts";
export { useSyncState } from "./useSyncState.ts";
export { type Transact, useTransact } from "./useTransact.ts";
export { errorMessage } from "./errors.ts";

export { toQueryState, type QueryState } from "../react/query-state.ts";
export type { ReceiptView } from "../react/receipt-state.ts";
export type { ReceiptState, SyncState } from "../client/index.ts";
