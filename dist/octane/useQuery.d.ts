/**
 * `useQuery` — one-shot `db.query(query)` as component state.
 *
 * Two rules for callers:
 *
 * - The view is structural: `useQuery(db.asOf(t), q)` built inline re-runs
 *   per `t`, not per render. The query is structural too (canonical
 *   serialization of the lowered AST). Put changing values in the query
 *   (`where({ issue: issueId })`).
 * - The in-flight state is `loading: true` over the *previous* `data` (no
 *   flash to `undefined` on scrub); stale answers are dropped last-write-wins
 *   by issue order, not by resolution order.
 */
import type { Schema, DbError, QueryError, QueryObject, ReadDb } from "../db/index.ts";
import * as Cause from "effect/Cause";
/** What a one-shot read looks like as component state. */
export interface Async<A, E = DbError> {
    /** The last completed run's rows — kept while the next run is in flight. */
    readonly data: A | undefined;
    /** The last completed run's failure. Cleared when a new run starts. */
    readonly error: Cause.Cause<E> | undefined;
    /** `true` from mount / input change until that run settles. */
    readonly loading: boolean;
}
export declare function useQuery<C extends Schema.Any, R, Out = readonly R[]>(db: ReadDb<C>, query: QueryObject<R, Out>): Async<Out, QueryError<Out>>;
//# sourceMappingURL=useQuery.d.ts.map