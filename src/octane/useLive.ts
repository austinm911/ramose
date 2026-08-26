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

import type {
  Schema,
  DbError,
  QueryError,
  QueryObject,
  ReadDb,
} from "../db/index.ts";
import { queryAstKey } from "../db/astKey.ts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import { useEffect, useMemo, useRef, useState } from "octane";
import { viewDep } from "../react/seam.ts";
import { splitSlot, subSlot } from "./internal.ts";

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

/** Query form: `db.effect.live(query)`, memoised on the view and query AST. */
export function useLive<C extends Schema.Any, R, Out = readonly R[]>(
  db: ReadDb<C>,
  query: QueryObject<R, Out>,
): Live<Out, QueryError<Out>>;
/** Stream form: a stream built elsewhere; re-subscribes when its identity changes. */
export function useLive<A, E>(stream: Stream.Stream<A, E>): Live<A, E>;
/**
 * @internal Stream form with the hook slot spelled out — how `usePull`
 * composes this hook. A `.tsrx` call site never writes this: the compiler
 * appends the slot to the two forms above (see `./internal.ts`).
 */
export function useLive<A, E>(stream: Stream.Stream<A, E>, slot: symbol): Live<A, E>;
export function useLive(
  source: ReadDb | Stream.Stream<unknown, unknown>,
  ...rest: unknown[]
): Live<unknown, unknown> {
  const [args, slot] = splitSlot(rest);
  const query = args[0] as QueryObject<unknown, unknown> | undefined;

  const sourceDep = query === undefined ? source : viewDep(source as ReadDb);
  const astKey = query === undefined ? "" : queryAstKey(query);
  const stream = useMemo(
    () =>
      query === undefined
        ? (source as Stream.Stream<unknown, unknown>)
        : (source as ReadDb).effect.live(query),
    [sourceDep, query === undefined ? source : astKey],
    subSlot(slot, "live:stream"),
  );

  const [state, setState] = useState<Live<unknown, unknown>>(
    INITIAL,
    subSlot(slot, "live:state"),
  );
  const astKeyRef = useRef(astKey, subSlot(slot, "live:ast"));

  useEffect(
    () => {
      const queryChanged = astKey !== astKeyRef.current;
      astKeyRef.current = astKey;
      if (query === undefined || queryChanged) {
        setState(INITIAL);
      }
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
    },
    [stream],
    subSlot(slot, "live:subscribe"),
  );

  return state;
}
