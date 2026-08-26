/**
 * `useLive` — a standing read as component state: `{ rows, error, ticks }`,
 * reset when the inputs change.
 *
 * Two rules for consumers:
 *
 * - Query form or stream form. `useLive(db, query)` memoises `db.effect.live`
 *   on the view's structural key and the query AST; `useLive(stream)` takes a
 *   stream built elsewhere and re-subscribes when its identity changes.
 *   Neither needs a provider.
 * - The view is structural, the query is structural (canonical serialization
 *   of the lowered AST): `useLive(db.asOf(t), q)` built inline re-subscribes
 *   per `t`, not per render. Put changing values in the query. A params-era
 *   third argument is gone — same literals, same key.
 */
import type { Schema, DbError, QueryError, QueryObject, ReadDb } from "../db/index.ts";
import * as Cause from "effect/Cause";
import * as Stream from "effect/Stream";
/** What a standing read looks like from a component. */
export interface Live<A, E = DbError> {
    /** The last emission; `undefined` until the first (and again right after the inputs change). */
    readonly rows: A | undefined;
    /**
     * Terminal failure of the stream. Transient errors never land here —
     * `live` retries them in place — and completion (a pinned `asOf` /
     * `history` view emitted its one pass) is not an error: `rows` stays.
     */
    readonly error: Cause.Cause<E> | undefined;
    /** Emissions after the first — how many times the basis moved under this subscription. */
    readonly ticks: number;
}
/** Query form: `db.effect.live(query)`, memoised on the view and query AST. */
export declare function useLive<C extends Schema.Any, R, Out = readonly R[]>(db: ReadDb<C>, query: QueryObject<R, Out>): Live<Out, QueryError<Out>>;
/** Stream form: a stream built elsewhere; re-subscribes when its identity changes. */
export declare function useLive<A, E>(stream: Stream.Stream<A, E>): Live<A, E>;
/**
 * @internal Stream form with the hook slot spelled out — how `usePull`
 * composes this hook. A `.tsrx` call site never writes this: the compiler
 * appends the slot to the two forms above (see `./internal.ts`).
 */
export declare function useLive<A, E>(stream: Stream.Stream<A, E>, slot: symbol): Live<A, E>;
//# sourceMappingURL=useLive.d.ts.map