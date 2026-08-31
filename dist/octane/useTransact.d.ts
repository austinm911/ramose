/**
 * `useTransact` — run an Effect from an event handler, and know whether it
 * is running and whether it failed.
 *
 * Deliberately not tied to the provider: it runs whatever Effect the caller
 * built (`run(moveIssue(db, id, status, rank))`), so it composes with a
 * module-singleton `Db` just as well as with `useDb`.
 */
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
export interface Transact {
    /**
     * Runs the effect; resolves to the outcome instead of throwing, so
     * handlers stay `void`-safe.
     */
    readonly run: <A, E>(effect: Effect.Effect<A, E>) => Promise<Exit.Exit<A, E>>;
    /** In-flight count > 0. */
    readonly pending: boolean;
    /**
     * The last-settled failure's error (not the cause) — cleared when a run
     * settles successfully.
     */
    readonly error: unknown | undefined;
    readonly clearError: () => void;
}
/**
 * One hook for running writes (any Effect with `R = never`, really) from
 * event handlers.
 *
 * - `run` resolves to the `Exit` — inspect it, or ignore it and read
 *   `error` / wire `onError` instead.
 * - `pending` counts concurrent runs: true while any run is in flight.
 * - `onError` fires per failure (the toast hook); `error` also lands on the
 *   return for inline rendering, and clears on the next successful run (or
 *   `clearError`).
 * - Concurrent runs settle independently and the last settler wins `error`:
 *   a failure that lands after a later-started success re-sets `error`.
 *   "Cleared on the next successful run" is about settle order, not start
 *   order.
 * - After unmount the effect still runs to completion, but no state is
 *   touched (guarded with a ref), so late settles never warn. `onError`
 *   still fires — the failure is real, and the toast host usually outlives
 *   the form that ran the write (toast after navigate-away is the point).
 */
export declare function useTransact(options?: {
    onError?: (error: unknown) => void;
}): Transact;
//# sourceMappingURL=useTransact.d.ts.map