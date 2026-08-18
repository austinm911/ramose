/**
 * `useQuery` — one-shot `db.q(query)` as React state.
 *
 * Re-runs when the *view* or the query changes: the view is compared
 * structurally (the seam's key), so `useQuery(db.asOf(t), q)` built inline
 * re-runs per `t` and only per `t` — a scrub over a time-travel slider is
 * exactly one query per slider move. `query` is compared by identity; pass
 * a hoisted value (a query value is a stable object — the docs already say
 * so for `live`).
 *
 * The in-flight state is `loading: true` over the *previous* `data` — a
 * scrub never flashes to `undefined`. Stale results are dropped
 * last-write-wins by issue order, not by resolution order: a slower answer
 * to an older run can never overwrite a newer run's rows.
 */

import type { Catalog, DbError, QueryInput, ReadDb } from "@ripple/alchemy/db";
import type * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { useEffect, useRef, useState } from "react";
import { viewDep } from "./seam.ts";

/** What a one-shot read looks like as React state. */
export interface Async<A, E = DbError> {
  /** The last completed run's rows — kept while the next run is in flight. */
  readonly data: A | undefined;
  /** The last completed run's failure. Cleared when a new run starts. */
  readonly error: Cause.Cause<E> | undefined;
  /** `true` from mount / input change until that run settles. */
  readonly loading: boolean;
}

export const useQuery = <C extends Catalog.Any, R>(
  db: ReadDb<C>,
  query: QueryInput<R>,
): Async<R> => {
  const [state, set] = useState<Async<R>>({
    data: undefined,
    error: undefined,
    loading: true,
  });
  /** Monotonic run counter, shared across effect runs: the LWW sequence. */
  const runs = useRef({ issued: 0, applied: 0 });

  useEffect(() => {
    const seq = ++runs.current.issued;
    let disposed = false;
    /** Land this run's outcome unless a later-issued run already landed. */
    const land = (next: (prev: Async<R>) => Async<R>): void => {
      if (disposed || seq < runs.current.applied) return;
      runs.current.applied = seq;
      set(next);
    };

    set((prev) =>
      prev.loading && prev.error === undefined
        ? prev
        : { data: prev.data, error: undefined, loading: true },
    );

    const fiber = Effect.runFork(
      db.q(query).pipe(
        Effect.flatMap((rows) =>
          Effect.sync(() =>
            land(() => ({ data: rows as R, error: undefined, loading: false })),
          ),
        ),
        Effect.catchCause((error) =>
          Effect.sync(() =>
            land((prev) => ({ data: prev.data, error, loading: false })),
          ),
        ),
      ),
    );

    return () => {
      disposed = true;
      Effect.runFork(Fiber.interrupt(fiber));
    };
    // the view is a structural dependency; `db` itself may be a fresh object
    // every render (`db.asOf(t)` is pure and unmemoised by design)
  }, [viewDep(db), query]);

  return state;
};
