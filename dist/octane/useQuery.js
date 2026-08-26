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
import { queryAstKey } from "../db/astKey.js";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { useEffect, useRef, useState } from "octane";
import { viewDep } from "../react/seam.js";
import { splitSlot, subSlot } from "./internal.js";
export function useQuery(db, query, ...rest) {
    const [, slot] = splitSlot(rest);
    const astKey = queryAstKey(query);
    const [state, set] = useState({ data: undefined, error: undefined, loading: true }, subSlot(slot, "query:state"));
    /** Monotonic run counter, shared across effect runs: the LWW sequence. */
    const runs = useRef({ issued: 0, applied: 0 }, subSlot(slot, "query:runs"));
    useEffect(() => {
        const seq = ++runs.current.issued;
        let disposed = false;
        /** Land this run's outcome unless a later-issued run already landed. */
        const land = (next) => {
            if (disposed || seq < runs.current.applied)
                return;
            runs.current.applied = seq;
            set(next);
        };
        set((prev) => prev.loading && prev.error === undefined
            ? prev
            : { data: prev.data, error: undefined, loading: true });
        const fiber = Effect.runFork(db.effect.query(query).pipe(Effect.flatMap((rows) => Effect.sync(() => land(() => ({ data: rows, error: undefined, loading: false })))), Effect.catchCause((error) => Cause.hasInterruptsOnly(error)
            ? Effect.void
            : Effect.sync(() => land((prev) => ({ data: prev.data, error, loading: false }))))));
        return () => {
            disposed = true;
            Effect.runFork(Fiber.interrupt(fiber));
        };
    }, [viewDep(db), astKey], subSlot(slot, "query:run"));
    return state;
}
//# sourceMappingURL=useQuery.js.map