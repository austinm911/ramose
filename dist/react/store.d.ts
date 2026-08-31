import type { ClientDatabase, QuerySubscription } from "../client/index.ts";
import { type QueryState } from "./query-state.ts";
/**
 * How many cached stores may sit unclaimed at once.
 *
 * A store is *claimed* once a mounted component has subscribed to it: from
 * then on React's own refcount decides when it leaves the cache. A store is
 * *unclaimed* between the render that built it and that first subscription —
 * and stays unclaimed forever if the render is abandoned, because React never
 * calls `subscribe` for a component it discarded. Concurrent rendering
 * abandons renders routinely: a descendant suspends, or a transition is
 * interrupted by a newer one, and a search box that queries per keystroke
 * leaves one entry behind per abandoned attempt.
 *
 * Unclaimed entries are evicted oldest-first past this bound. The bound is far
 * above the number of distinct queries one render pass asks, so eviction never
 * separates two components that mounted together on the same question: only a
 * pass with more distinct queries than this could evict an entry a later
 * sibling in the same pass would have shared, and that sibling would then
 * build a second observation rather than lose one.
 */
export declare const UNCLAIMED_LIMIT = 32;
/**
 * Something observing a store on behalf of a component React has discarded.
 *
 * A suspended component is not alive to hold a subscription, so the value it
 * suspended for would never be computed; the hold observes in its place. It is
 * `settled` once the wait it exists for is over, which is both when it may be
 * evicted and when it may hand its observation to the subscription React
 * finally commits.
 */
export type StoreHold = {
    readonly settled: () => boolean;
    readonly onClaimed: () => void;
    readonly onEvicted: () => void;
};
declare class QueryStore<A> {
    private readonly database;
    private readonly key;
    private readonly source;
    private lastSnapshot;
    private lastState;
    private listeners;
    private hold;
    constructor(database: ClientDatabase, key: string, source: QuerySubscription<A>);
    /**
     * Observe on behalf of something outside React's lifetime.
     *
     * The returned release is idempotent and drops the store from the cache when
     * it was the last observer, exactly as a component's own release does.
     */
    readonly retain: (onChange: () => void) => (() => void);
    /**
     * Observe on behalf of a mounted component, and claim this entry.
     *
     * A hold is told React has taken over only after React's own subscription is
     * wired: a hold that released first would take the observation to zero
     * listeners and retire it between the two.
     */
    readonly subscribe: (onChange: () => void) => (() => void);
    /**
     * Take a hold on behalf of a component React discarded.
     *
     * A store a mounted component has already claimed is outside both of a
     * hold's release paths — eviction only reaches unclaimed entries, and the
     * claim that would hand the observation over already happened. So the hold
     * is told at once, which is safe for the same reason the ordering rule in
     * `subscribe` is: a subscriber is already holding this observation open.
     */
    attach(hold: StoreHold): void;
    detach(hold: StoreHold): void;
    held(): StoreHold | undefined;
    private erased;
    readonly getSnapshot: () => QueryState<A>;
}
/**
 * Reconsider a database's unclaimed entries.
 *
 * A hold that has just settled became evictable, and nothing else would have
 * looked at the cache until the next render adopted something new.
 */
export declare const reviewUnclaimed: (database: ClientDatabase) => void;
export declare const queryStore: <A>(database: ClientDatabase, key: string, observe: () => QuerySubscription<A>) => QueryStore<A>;
/**
 * How many stores this database currently holds.
 *
 * That is the stores mounted components subscribe to, plus at most
 * `UNCLAIMED_LIMIT` that no component has claimed yet.
 */
export declare const heldStoreCount: (database: ClientDatabase) => number;
export type { QueryStore };
//# sourceMappingURL=store.d.ts.map