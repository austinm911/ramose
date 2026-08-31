/**
 * `useQuery` / `useSuspenseQuery` — one query observed as component state.
 *
 * `ClientDatabase.observe` is already a standing subscription over the local
 * replica, so there is no live/one-shot split left to expose: both hooks here
 * read the same interned store, and the only difference is whether a component
 * with no local answer yet waits or renders `pending`.
 */
import { useContext, useSyncExternalStore } from "octane";
import { queryObservationKey } from "../client/database.js";
// `../react/*` below is the framework-neutral half of the React adapter — no
// React import anywhere in it. Both bindings share these so the observation
// cache, the snapshot narrowing and the suspension bookkeeping cannot drift.
import { PENDING } from "../react/query-state.js";
import { queryStore } from "../react/store.js";
import { suspend, watchLocal } from "../react/suspense.js";
import { RamoseContext } from "./hooks.js";
import { splitSlot, subSlot } from "./internal.js";
const pendingOnServer = () => PENDING;
const IN_BROWSER = typeof document !== "undefined";
/** The database, key and interned store one query hook reads. */
const observation = (query, database, provided, hook) => {
    const db = database ?? provided?.open();
    if (db === undefined) {
        throw new Error(`ramose/octane: ${hook} needs a <RamoseProvider> or an explicit database`);
    }
    watchLocal(db);
    const key = queryObservationKey(query);
    return {
        db,
        key,
        store: queryStore(db, key, () => db.observe(query)),
    };
};
export function useQuery(query, ...rest) {
    const [args, slot] = splitSlot(rest);
    const [database] = args;
    const observed = observation(query, database, useContext(RamoseContext), "useQuery");
    return useSyncExternalStore(observed.store.subscribe, observed.store.getSnapshot, pendingOnServer, subSlot(slot, "query:store"));
}
export function useSuspenseQuery(query, ...rest) {
    const [args, slot] = splitSlot(rest);
    const [database] = args;
    const observed = observation(query, database, useContext(RamoseContext), "useSuspenseQuery");
    if (IN_BROWSER && observed.store.getSnapshot().status === "pending") {
        const waiting = suspend(observed.db, observed.key, observed.store);
        if (waiting !== undefined)
            throw waiting;
    }
    return useSyncExternalStore(observed.store.subscribe, observed.store.getSnapshot, pendingOnServer, subSlot(slot, "query:store"));
}
//# sourceMappingURL=useQuery.js.map