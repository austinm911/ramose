"use client";
import { assertLoweringPurity, liveSubscriptionKey, queryStructureKey, } from "../db/astKey.js";
import { lowerQueryObject } from "../db/query/index.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { retainLive } from "./liveCache.js";
import { asError, asLoading, asSuccess, hydrateRead, READ_INITIAL, readT, } from "./read.js";
import { seamOf, viewKeyOf } from "./seam.js";
import { ensureLive, evictSuspend, peekSuspend, retireSuspend, } from "./suspend.js";
/**
 * Drive a {@link Subscription} as `Read` state. `acquire` runs inside the
 * effect; the hook closes only handles it created. `resetKeys` blanks `data`
 * when the subscription identity actually changes (not on a render-fresh
 * handle).
 */
const firstPaint = (options, suspendKey, allowHydrate = true) => {
    if (allowHydrate) {
        const hydrated = hydrateRead(options);
        if (hydrated.data !== undefined)
            return hydrated;
    }
    const empty = READ_INITIAL;
    if (options?.suspense !== true || suspendKey === undefined)
        return empty;
    const slot = peekSuspend(suspendKey);
    return slot?.data !== undefined
        ? asSuccess(slot.data, options.initialT ?? options.basis?.())
        : empty;
};
export const useLiveSubscription = (acquire, deps, resetKeys, options) => {
    const suspendKey = options?.suspendKey;
    const [state, setState] = useState(() => firstPaint(options, suspendKey));
    const seen = useRef(resetKeys);
    const seedRef = useRef(options?.initialData);
    const identityChanged = seen.current.length !== resetKeys.length ||
        seen.current.some((key, i) => key !== resetKeys[i]);
    const seedChanged = !Object.is(seedRef.current, options?.initialData);
    if (identityChanged) {
        seen.current = resetKeys;
        seedRef.current = options?.initialData;
        setState(firstPaint(options, suspendKey, seedChanged));
    }
    const optionsRef = useRef(options);
    optionsRef.current = options;
    const refetchRuns = useRef({ issued: 0, applied: 0 });
    const [nudge, setNudge] = useState(0);
    const [epoch, setEpoch] = useState(0);
    const refetch = useCallback(() => {
        const opts = optionsRef.current;
        if (opts?.refetch !== undefined) {
            const seq = ++refetchRuns.current.issued;
            setState((prev) => asLoading(prev));
            void opts
                .refetch()
                .then((data) => {
                if (seq < refetchRuns.current.applied)
                    return;
                refetchRuns.current.applied = seq;
                setState(asSuccess(data, opts.basis?.()));
            })
                .catch((error) => {
                if (seq < refetchRuns.current.applied)
                    return;
                refetchRuns.current.applied = seq;
                setState((prev) => asError(prev, error));
            });
            return;
        }
        setNudge((n) => n + 1);
    }, []);
    const retry = useCallback(() => {
        const key = optionsRef.current?.suspendKey;
        if (key !== undefined)
            evictSuspend(key);
        setState((prev) => asLoading(prev));
        setEpoch((n) => n + 1);
    }, []);
    const retryRef = useRef(retry);
    retryRef.current = retry;
    useEffect(() => {
        const { sub, owned } = acquire();
        let cancelled = false;
        const off = sub.subscribe((data) => {
            if (cancelled)
                return;
            const t = optionsRef.current?.basis?.();
            setState((prev) => prev.data === data &&
                prev.t === t &&
                prev.error === undefined &&
                !prev.isLoading
                ? prev
                : asSuccess(data, t));
        }, (error) => {
            if (cancelled)
                return;
            setState((prev) => prev.error === error && !prev.isLoading
                ? prev
                : asError(prev, error));
        });
        return () => {
            cancelled = true;
            off();
            if (owned)
                sub.close();
        };
        // acquire closes over the same values as deps; nudge remounts a
        // caller-owned handle on refetch(); epoch remounts on retry()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, nudge, epoch]);
    const error = state.error;
    useEffect(() => {
        if (error === undefined)
            return;
        const seam = optionsRef.current?.seam;
        if (seam === undefined)
            return;
        const genAtError = seam.generation();
        const off = seam.onWake(() => {
            if (seam.generation() > genAtError && seam.status() === "live") {
                retryRef.current();
            }
        });
        return () => {
            off?.();
        };
    }, [error]);
    let shown = identityChanged
        ? firstPaint(options, suspendKey, seedChanged)
        : state;
    if (options?.suspense === true &&
        suspendKey !== undefined &&
        shown.data === undefined &&
        shown.error === undefined) {
        const slot = ensureLive(suspendKey, acquire);
        if (slot.error !== undefined) {
            retireSuspend(suspendKey);
            throw slot.error;
        }
        if (slot.data === undefined)
            throw slot.promise;
        shown = asSuccess(slot.data, options.initialT ?? options.basis?.());
        if (state.data !== slot.data)
            setState(shown);
    }
    return { ...shown, refetch, retry };
};
let DEV = true;
try {
    DEV = process.env.NODE_ENV !== "production";
}
catch {
    // no `process`, no substitution — stay in dev mode
}
const CHURN_WARNING = "ramose/react: useLiveQuery subscription key changed between renders. " +
    "Queries are keyed structurally on the lowered AST — a value minted " +
    "each render (e.g. where({ at: new Date() })) tears the subscription " +
    "down. Hoist the query or keep bound values stable.";
/**
 * Consecutive query-half key changes before the dev warning fires.
 * One legitimate navigation (`issueId` A → B) is silent; a `Date.now()`
 * footgun changes every render and trips this. A same-key follow-up
 * (the hook blanking `data` via setState) does not reset the streak;
 * two quiet same-key renders do — that is a settled navigation.
 */
const CHURN_STREAK = 3;
const CHURN_SETTLE = 2;
/**
 * Dev-only: warn once per hook site when the **query-half** (AST key)
 * churns for {@link CHURN_STREAK} consecutive changes. A view (`asOf(t)`)
 * change is the documented path and stays silent. A single A → B change
 * does not warn.
 */
const useKeyChurnWarning = (key) => {
    const prev = useRef(undefined);
    const streak = useRef(0);
    const settled = useRef(0);
    const warned = useRef(false);
    if (!DEV) {
        prev.current = key;
        return;
    }
    if (prev.current === undefined) {
        prev.current = key;
        return;
    }
    if (prev.current !== key) {
        streak.current += 1;
        settled.current = 0;
        if (streak.current >= CHURN_STREAK && !warned.current) {
            warned.current = true;
            console.warn(CHURN_WARNING);
        }
    }
    else {
        settled.current += 1;
        if (settled.current >= CHURN_SETTLE)
            streak.current = 0;
    }
    prev.current = key;
};
const isSubscription = (value) => typeof value === "object" &&
    value !== null &&
    typeof value.subscribe === "function" &&
    typeof value.close === "function";
const subKeys = new WeakMap();
let nextSubKey = 1;
const subscriptionKey = (sub) => {
    const held = subKeys.get(sub);
    if (held !== undefined)
        return held;
    const key = `sub:${nextSubKey++}`;
    subKeys.set(sub, key);
    return key;
};
export function useLiveQuery(source, queryOrOptions, options) {
    const owned = !isSubscription(source);
    const query = owned
        ? queryOrOptions
        : undefined;
    const opts = owned ? options : queryOrOptions;
    const viewKey = owned ? viewKeyOf(source) : "";
    const structureKey = owned ? queryStructureKey(query) : "";
    const cacheKey = owned ? liveSubscriptionKey(viewKey, query) : "";
    const suspendKey = owned
        ? `live\0${cacheKey}`
        : `live\0${subscriptionKey(source)}`;
    useKeyChurnWarning(owned ? structureKey : "");
    const db = owned ? source : undefined;
    const queryRef = useRef(query);
    queryRef.current = query;
    const dbRef = useRef(db);
    dbRef.current = db;
    return useLiveSubscription(() => {
        if (!owned) {
            return {
                sub: source,
                owned: false,
            };
        }
        if (DEV)
            assertLoweringPurity(query);
        const seam = seamOf(source);
        // `finalize` is only correct on the raw wire result. A hand-rolled
        // ReadDb without `liveRaw` already emits shaped rows from `live()`.
        if (seam?.liveRaw !== undefined) {
            let finalize;
            try {
                finalize = lowerQueryObject(query).finalize;
            }
            catch {
                // liveRaw will surface the same lowering failure
            }
            return {
                sub: retainLive(cacheKey, () => seam.liveRaw(query), finalize),
                owned: true,
            };
        }
        return {
            sub: retainLive(cacheKey, () => source.live(query)),
            owned: true,
        };
    }, owned ? [cacheKey] : [source], owned ? [viewKey, structureKey] : [source], {
        initialData: opts?.initialData,
        initialT: opts?.initialT,
        suspense: opts?.suspense,
        suspendKey,
        basis: () => readT(dbRef.current),
        refetch: owned
            ? () => dbRef.current.query(queryRef.current)
            : undefined,
        seam: owned
            ? {
                generation: () => seamOf(dbRef.current)?.generation() ?? 0,
                status: () => seamOf(dbRef.current)?.status() ?? "offline",
                onWake: (cb) => seamOf(dbRef.current)?.onWake(cb),
            }
            : undefined,
    });
}
//# sourceMappingURL=useLiveQuery.js.map