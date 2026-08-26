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
import { queryAstKey } from "../db/astKey.ts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { useEffect, useRef, useState } from "octane";
import { viewDep } from "../react/seam.ts";
import { splitSlot, subSlot } from "./internal.ts";

/** What a one-shot read looks like as component state. */
export interface Async<A, E = DbError> {
  /** The last completed run's rows — kept while the next run is in flight. */
  readonly data: A | undefined;
  /** The last completed run's failure. Cleared when a new run starts. */
  readonly error: Cause.Cause<E> | undefined;
  /** `true` from mount / input change until that run settles. */
  readonly loading: boolean;
}

export function useQuery<C extends Schema.Any, R, Out = readonly R[]>(
  db: ReadDb<C>,
  query: QueryObject<R, Out>,
): Async<Out, QueryError<Out>>;
export function useQuery<C extends Schema.Any, R, Out = readonly R[]>(
  db: ReadDb<C>,
  query: QueryObject<R, Out>,
  ...rest: [slot?: symbol]
): Async<Out, QueryError<Out>> {
  const [, slot] = splitSlot(rest);
  const astKey = queryAstKey(query);
  const [state, set] = useState<Async<Out, QueryError<Out>>>(
    { data: undefined, error: undefined, loading: true },
    subSlot(slot, "query:state"),
  );
  /** Monotonic run counter, shared across effect runs: the LWW sequence. */
  const runs = useRef({ issued: 0, applied: 0 }, subSlot(slot, "query:runs"));

  useEffect(
    () => {
      const seq = ++runs.current.issued;
      let disposed = false;
      /** Land this run's outcome unless a later-issued run already landed. */
      const land = (
        next: (prev: Async<Out, QueryError<Out>>) => Async<Out, QueryError<Out>>,
      ): void => {
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
        db.effect.query(query).pipe(
          Effect.flatMap((rows) =>
            Effect.sync(() =>
              land(() => ({ data: rows as Out, error: undefined, loading: false })),
            ),
          ),
          Effect.catchCause((error) =>
            Cause.hasInterruptsOnly(error)
              ? Effect.void
              : Effect.sync(() =>
                  land((prev) => ({ data: prev.data, error, loading: false })),
                ),
          ),
        ),
      );

      return () => {
        disposed = true;
        Effect.runFork(Fiber.interrupt(fiber));
      };
    },
    [viewDep(db), astKey],
    subSlot(slot, "query:run"),
  );

  return state;
}
