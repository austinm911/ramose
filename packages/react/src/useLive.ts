/**
 * `useLive` — a standing read as React state.
 *
 * Two forms, one contract:
 *
 * ```tsx
 * const { rows, error, ticks } = useLive(db, todoQuery);   // query form
 * const { rows } = useLive(stream);                        // stream form
 * ```
 *
 * The query form memoises `db.live(query)` on `[db, query]` — the memo every
 * consumer was hand-rolling. Both arguments must be stable values: the `Db`
 * from `useDb` (already memoised) or a `db.asOf(t)` view held in a memo, and
 * a hoisted query (a query is a stable object; build it at module scope).
 * The stream form takes any `Stream` an Effect user built themselves and
 * re-subscribes when its identity changes. Neither form needs a provider:
 * `live` requires nothing (`R = never`), so the drain is a plain
 * `Effect.runFork`. Taking `db` explicitly is what lets the query form
 * compose with `asOf(t)` / `history` views.
 */

import type {
  Catalog,
  DbError,
  QueryInput,
  ReadDb,
} from "@ripple/alchemy/db";
import type * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import { useEffect, useMemo, useState } from "react";

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

const INITIAL: Live<never, never> = {
  rows: undefined,
  error: undefined,
  ticks: 0,
};

/** Query form: `db.live(query)`, memoised on `[db, query]`. */
export function useLive<C extends Catalog.Any, R>(
  db: ReadDb<C>,
  query: QueryInput<R>,
): Live<R>;
/** Stream form: a stream built elsewhere; re-subscribes when its identity changes. */
export function useLive<A, E>(stream: Stream.Stream<A, E>): Live<A, E>;
export function useLive(
  source: ReadDb | Stream.Stream<unknown, unknown>,
  query?: QueryInput<unknown>,
): Live<unknown, unknown> {
  // Both overloads funnel into one stream, so the hook order never varies:
  // the query form derives it here, the stream form passes through (`query`
  // is `undefined`, so the memo is keyed on the stream's own identity).
  const stream = useMemo(
    () =>
      query === undefined
        ? (source as Stream.Stream<unknown, unknown>)
        : (source as ReadDb).live(query),
    [source, query],
  );

  const [state, setState] = useState<Live<unknown, unknown>>(INITIAL);

  useEffect(() => {
    // New inputs, blank slate. On the very first pass this is the value
    // `useState` already holds, so React bails out without a render.
    setState(INITIAL);
    let emissions = 0;
    const fiber = Effect.runFork(
      Stream.runForEach(stream, (rows) =>
        Effect.sync(() => {
          const ticks = emissions;
          emissions += 1;
          setState({ rows, error: undefined, ticks });
        }),
      ).pipe(
        // Only a terminal failure reaches this: interruption (the cleanup
        // below) skips recovery, and completion is not a Cause.
        Effect.catchCause((error) =>
          Effect.sync(() => setState((prev) => ({ ...prev, error }))),
        ),
      ),
    );
    // Interrupting the fork is the whole teardown; StrictMode's
    // mount → interrupt → mount leaves exactly the second subscription.
    return () => void Effect.runFork(Fiber.interrupt(fiber));
  }, [stream]);

  return state;
}
