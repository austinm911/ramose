/**
 * `useLive` — a standing read as React state: `{ rows, error, ticks }`,
 * reset when the inputs change.
 *
 * Two rules for consumers:
 *
 * - Query form or stream form. `useLive(db, query)` memoises `db.live(query)`
 *   on `[db, query]`; `useLive(stream)` takes a stream built elsewhere and
 *   re-subscribes when its identity changes. Neither needs a provider.
 * - Both inputs must be stable values: a hoisted query (a query is a stable
 *   object; build it at module scope) and the `Db` from `useDb` — or an
 *   `asOf(t)` / `history` view held in a `useMemo`, which is why the query
 *   form takes `db` explicitly instead of reaching for context.
 */

import type {
  Catalog,
  DbError,
  QueryInput,
  ReadDb,
} from "@ripple/alchemy/db";
import * as Cause from "effect/Cause";
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
    let cancelled = false;
    const fiber = Effect.runFork(
      Stream.runForEach(stream, (rows) =>
        Effect.sync(() => {
          if (cancelled) return;
          const ticks = emissions;
          emissions += 1;
          setState({ rows, error: undefined, ticks });
        }),
      ).pipe(
        Effect.catchCause((error) =>
          Effect.sync(() => {
            // `catchCause` recovers from interruption too, not only failure
            // and defect. An interrupt reaching here is teardown — the
            // cleanup below, or an interrupted fiber inside the stream —
            // never news: drop it, and write nothing once the cleanup ran,
            // so a dead subscription cannot stamp state onto the next one.
            if (cancelled || Cause.hasInterrupts(error)) return;
            setState((prev) => ({ ...prev, error }));
          }),
        ),
      ),
    );
    return () => {
      cancelled = true;
      void Effect.runFork(Fiber.interrupt(fiber));
    };
  }, [stream]);

  return state;
}
