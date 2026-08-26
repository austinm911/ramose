/**
 * `ramose/octane` — [Octane](https://github.com/octanejs/octane) bindings for
 * Ramose. The same surface as `ramose/react`, named hooks, not a namespace:
 *
 * ```tsx
 * import { RamoseProvider, useDb } from "ramose/octane";
 * ```
 *
 * `RamoseProvider` owns one `Client` per subtree (connect on mount / prop
 * change, close on unmount / prop change), `useRamose()` hands it back, and
 * `useDb(name, schema)` memoises a `Db` from it. On top sit the reads —
 * `useLive` (standing query as state), `useQuery` (one-shot `db.query` as
 * `Async`), `usePull` (standing `db.livePull` as `Live`), `useBasis` (where
 * the basis is) — plus `useOperation(db, op)` around `db.run`,
 * `useTransact()` for Effect writes from event handlers (works with or
 * without the provider), and `errorMessage` for toast text.
 *
 * These are hand-written plain-`.ts` hooks, so they carry their own hook
 * slots (see `./internal.ts` and the `octane.hookSlots` field in
 * `package.json`): the slot octane's compiler appends at your call site is
 * split off and sub-keyed per composed hook. Nothing about that is visible
 * from a `.tsrx` component — call them exactly as you would call the React
 * ones.
 *
 * Server rendering reads synchronously and subscribes to nothing: every
 * subscription in this entry lives in an effect, and octane's server hooks do
 * not run effects. A standing read is `{ rows: undefined, ticks: 0 }` on the
 * server and fills in after hydration.
 */

export { RamoseProvider, type RamoseProviderProps } from "./RamoseProvider.ts";
export { useDb, useRamose } from "./hooks.ts";
export { type Live, useLive } from "./useLive.ts";
export { type Async, useQuery } from "./useQuery.ts";
export { usePull } from "./usePull.ts";
export { useBasis } from "./useBasis.ts";
export { type Transact, useTransact } from "./useTransact.ts";
export {
  type OperationHandle,
  type OperationOptions,
  type RunResult,
  useOperation,
} from "./useOperation.ts";
export { errorMessage } from "./errors.ts";
