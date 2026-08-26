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
import { queryAstKey } from "../db/astKey.js";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import { useEffect, useMemo, useRef, useState } from "octane";
import { viewDep } from "../react/seam.js";
import { splitSlot, subSlot } from "./internal.js";
const INITIAL = {
    rows: undefined,
    error: undefined,
    ticks: 0,
};
export function useLive(source, ...rest) {
    const [args, slot] = splitSlot(rest);
    const query = args[0];
    const sourceDep = query === undefined ? source : viewDep(source);
    const astKey = query === undefined ? "" : queryAstKey(query);
    const stream = useMemo(() => query === undefined
        ? source
        : source.effect.live(query), [sourceDep, query === undefined ? source : astKey], subSlot(slot, "live:stream"));
    const [state, setState] = useState(INITIAL, subSlot(slot, "live:state"));
    const astKeyRef = useRef(astKey, subSlot(slot, "live:ast"));
    useEffect(() => {
        const queryChanged = astKey !== astKeyRef.current;
        astKeyRef.current = astKey;
        if (query === undefined || queryChanged) {
            setState(INITIAL);
        }
        let emissions = 0;
        let cancelled = false;
        const fiber = Effect.runFork(Stream.runForEach(stream, (rows) => Effect.sync(() => {
            if (cancelled)
                return;
            const ticks = emissions;
            emissions += 1;
            setState({ rows, error: undefined, ticks });
        })).pipe(Effect.catchCause((error) => Effect.sync(() => {
            if (cancelled || Cause.hasInterrupts(error))
                return;
            setState((prev) => ({ ...prev, error }));
        }))));
        return () => {
            cancelled = true;
            void Effect.runFork(Fiber.interrupt(fiber));
        };
    }, [stream], subSlot(slot, "live:subscribe"));
    return state;
}
//# sourceMappingURL=useLive.js.map