/**
 * `useLiveQuery` — a live query as React `Read` state: `{ data, error,
 * status, isLoading, t, refetch, retry }`, reset when the subscription
 * identity changes. `{ initialData, initialT }` hydrates that identity;
 * `{ suspense: true }` throws until it has a value.
 *
 * Two rules for consumers:
 *
 * - `useLiveQuery(db, query)` constructs a shared raw live read inside the
 *   effect, keyed on the view and the lowered query AST. Neither needs a
 *   provider. Two sites with the same AST share one raw subscription
 *   (refcount; last unmount tears it down); each hook applies its own
 *   `finalize` (take-unwrap / page-wrap) on read, so `one()` and `.limit(1)`
 *   share the wire result without swapping shapes.
 * - The view is structural (`DbSeam.key`), the query is structural
 *   (canonical serialization of the lowered AST). `useLiveQuery(db.asOf(t),
 *   q)` built inline re-subscribes per `t`, not per render — the same rule
 *   as `useQuery` / `useLivePull`. Put changing values in the query
 *   (`where({ issue: issueId })`). Same literals → same key, even when the
 *   object is new every render. Changing an inline literal changes the AST
 *   key and resubscribes — that is the point.
 *
 * Subscription form (`useLiveQuery(sub)`) keys on handle **identity**. The
 * hook never `close()`s a handle it did not create — only `off()`.
 * `useLiveQuery(db.live(q))` built inline is a new subscription every
 * render and will re-subscribe forever — use the query form instead. A
 * caller-owned handle is never share-cached.
 */
import type { ConnectionStatus, Schema, QueryError, QueryObject, ReadDb, Subscription } from "../db/index.ts";
import { type Read, type ReadOptions, type SuspendedRead } from "./read.ts";
type Acquire<A, E> = () => {
    readonly sub: Subscription<A, E>;
    readonly owned: boolean;
};
interface LiveSeam {
    readonly generation: () => number;
    readonly status: () => ConnectionStatus;
    readonly onWake: (cb: () => void) => (() => void) | undefined;
}
interface LiveOptions<A, E = unknown> extends ReadOptions<A> {
    readonly basis?: () => number | undefined;
    readonly refetch?: () => Promise<A>;
    readonly seam?: LiveSeam;
    /** Structural key for `{ suspense: true }` — view + AST, or handle identity. */
    readonly suspendKey?: string;
}
export declare const useLiveSubscription: <A, E>(acquire: Acquire<A, E>, deps: readonly unknown[], resetKeys: readonly unknown[], options?: LiveOptions<A, E>) => Read<A, E>;
/** Query form: `db.live(query)`, constructed inside the effect. */
export declare function useLiveQuery<C extends Schema.Any, R, Out = readonly R[]>(db: ReadDb<C>, query: QueryObject<R, Out>, options: ReadOptions<Out> & {
    suspense: true;
}): SuspendedRead<Out, QueryError<Out>>;
export declare function useLiveQuery<C extends Schema.Any, R, Out = readonly R[]>(db: ReadDb<C>, query: QueryObject<R, Out>, options?: ReadOptions<Out>): Read<Out, QueryError<Out>>;
/** Subscription form: a handle built elsewhere; re-subscribes when its identity changes. */
export declare function useLiveQuery<A, E>(sub: Subscription<A, E>, options: ReadOptions<A> & {
    suspense: true;
}): SuspendedRead<A, E>;
export declare function useLiveQuery<A, E>(sub: Subscription<A, E>, options?: ReadOptions<A>): Read<A, E>;
export {};
//# sourceMappingURL=useLiveQuery.d.ts.map