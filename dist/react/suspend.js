/**
 * First-emission / first-run thenables for `{ suspense: true }`.
 *
 * Suspense cannot wait on a `useEffect` — the component is not committed
 * while it throws, so the effect never starts. These helpers begin the
 * work during render, keyed on the same structural identity the hooks
 * already use, and stash the first value so the remount hydrates.
 */
const slots = new Map();
const asThenable = (promise) => {
    const thenable = promise;
    thenable.status = "pending";
    promise.then((value) => {
        thenable.status = "fulfilled";
        thenable.value = value;
    }, (reason) => {
        thenable.status = "rejected";
        thenable.reason = reason;
    });
    return thenable;
};
export const peekSuspend = (key) => slots.get(key);
export const evictSuspend = (key) => {
    const slot = slots.get(key);
    slots.delete(key);
    slot?.release?.();
};
/**
 * Drop a slot after the current React flush. Used when throwing a
 * terminal error: the same tick's replay still sees the cached failure
 * (so we do not replace it with a pending promise and hang Suspense),
 * and the next mount re-acquires.
 */
export const retireSuspend = (key) => {
    queueMicrotask(() => {
        evictSuspend(key);
    });
};
/**
 * First emission of a standing read. `acquire` runs on the first call
 * per key; the handle is closed after that emission so the hook's
 * effect can own the live subscription.
 */
export const ensureLive = (key, acquire) => {
    const held = slots.get(key);
    if (held !== undefined)
        return held;
    const { sub, owned } = acquire();
    const slot = {
        promise: undefined,
    };
    // `fromStream` / `retainLive` replay a cached latest value inside
    // `subscribe`, before the unsubscribe handle is assigned. Hoist
    // `off` and tear down again after `subscribe` returns so a
    // synchronous replay still unsubscribes and (when we own it)
    // closes the handle. Evict of a still-pending slot uses the same
    // `release` so an abandoned acquire does not stay open until the
    // first emission.
    let off;
    let released = false;
    const release = () => {
        if (released || off === undefined)
            return;
        released = true;
        off();
        if (owned)
            sub.close();
    };
    slot.release = release;
    slot.promise = asThenable(new Promise((resolve, reject) => {
        let settled = false;
        const onValue = (data) => {
            slot.data = data;
            settled = true;
            release();
            resolve(data);
        };
        const onError = (error) => {
            slot.error = error;
            settled = true;
            release();
            reject(error);
        };
        off = sub.subscribe(onValue, onError);
        if (settled)
            release();
    }));
    slot.promise.catch(() => { });
    slots.set(key, slot);
    return slot;
};
/** First settlement of a one-shot `run()`. */
export const ensureOneShot = (key, run, basis) => {
    const held = slots.get(key);
    if (held !== undefined)
        return held;
    const slot = {
        promise: undefined,
    };
    slot.promise = asThenable(run().then((data) => {
        slot.data = data;
        slot.t = basis();
        return data;
    }, (error) => {
        slot.error = error;
        throw error;
    }));
    slot.promise.catch(() => { });
    slots.set(key, slot);
    return slot;
};
//# sourceMappingURL=suspend.js.map