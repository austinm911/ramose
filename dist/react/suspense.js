import { reviewUnclaimed } from "./store.js";
/**
 * Whether a session in this state could still produce a first local value.
 *
 * `idle` and `connecting` are on their way to one, and `live` and `stale` have
 * one. An offline session does not, and a query with no local answer would
 * wait on it forever. That is not a failure — offline with nothing cached is a
 * steady state Ramose is built to sit in — so it is reported as `pending` for
 * the component to render rather than suspended on.
 */
const delivers = (status) => status === "idle" || status === "connecting" || carries(status);
/**
 * Whether a session in this state says a local value for its scope exists.
 *
 * `live` and `stale` are both published over a value the session has; `stale`
 * is a restored replica this session has not confirmed.
 */
const carries = (status) => status === "live" || status === "stale";
/**
 * Whether no later session state could change what this scope can answer.
 *
 * A closed handle, a refused credential and a build the queue is ahead of are
 * all decided: an application recovers by signing in again, reloading, or
 * constructing another client, not by this query waiting longer.
 */
const decided = (status) => status === "closed" || status === "authentication-required" ||
    status === "update-required";
/**
 * The databases whose session has reported a local value at least once.
 *
 * A connection that drops after that says nothing about whether a query's
 * first answer is coming: what an unanswered query is then waiting for is a
 * local computation over a value that is already here, which always publishes
 * something. Without this, a restored replica whose session fails a moment
 * before the query finishes running would be read as "offline and nothing
 * cached" and flash an empty scope over data that was about to arrive.
 *
 * `connecting` withdraws it, because that is the one status published exactly
 * where nothing is readable: a fence and a failed activation both go back
 * through it, and a graph child republishes its parent's. Without the
 * withdrawal a scope whose value was taken away would be remembered as having
 * one forever, and a reactivation that then failed would leave a fallback
 * waiting on connectivity with nothing to wait for.
 */
const LOCAL = new WeakSet();
const WATCHED = new WeakSet();
/**
 * Follow one database's session, so that what it reports is never missed.
 *
 * This has to be observed rather than sampled. A replica warmed through
 * `useQuery` alone passes through `live` or `stale` between renders, with no
 * suspense hook running to notice; the first `useSuspenseQuery` after that
 * connection drops would then read "offline and nothing cached" over a replica
 * that is fully loaded, and render an empty scope one tick before the data.
 * Every query hook starts this watch for the same reason: the database to
 * follow is the one an application reads, not the one it happens to suspend
 * on.
 *
 * The subscription is deliberately never released. It is one listener per
 * database, on a store the client owns for its own lifetime, and there is no
 * later moment at which forgetting what a session reported would be correct:
 * the fact this records outlives every component that could have released it.
 */
export const watchLocal = (database) => {
    if (WATCHED.has(database))
        return;
    WATCHED.add(database);
    const note = () => {
        const status = database.sync.getSnapshot().status;
        if (carries(status))
            LOCAL.add(database);
        else if (status === "connecting")
            LOCAL.delete(database);
    };
    database.sync.subscribe(note);
    note();
};
const reads = (database) => {
    watchLocal(database);
    const status = database.sync.getSnapshot().status;
    return !decided(status) && (LOCAL.has(database) || delivers(status));
};
/**
 * The wait one suspended component is doing, held where React cannot discard
 * it.
 *
 * React throws away the component that suspends, so nothing in its own
 * lifetime is left observing the query it suspended for and the value would
 * never be computed. This observes in its place, from the render that suspends
 * until the commit that replaces it — or until the cache evicts it, which is
 * what bounds a wait whose component was unmounted while its fallback was on
 * screen.
 */
class QuerySuspension {
    database;
    store;
    waiting;
    key;
    promise;
    resolve;
    done = false;
    claimed = false;
    released = false;
    stopStore;
    stopSync;
    constructor(database, store, waiting, key) {
        this.database = database;
        this.store = store;
        this.waiting = waiting;
        this.key = key;
        this.promise = new Promise((resolve) => {
            this.resolve = resolve;
        });
        const check = () => this.check();
        this.stopStore = store.retain(check);
        this.stopSync = database.sync.subscribe(check);
        store.attach(this);
        this.check();
    }
    settled() {
        return this.done;
    }
    /** Whether this has already let go of its observation. */
    gone() {
        return this.released;
    }
    check() {
        if (this.done)
            return;
        if (this.store.getSnapshot().status === "pending" && reads(this.database)) {
            return;
        }
        this.done = true;
        this.resolve();
        if (this.claimed)
            this.stop();
        else
            reviewUnclaimed(this.database);
    }
    /**
     * React committed a subscription of its own.
     *
     * The observation is only handed over once the wait is over: releasing it
     * while a component is still suspended would leave that component waiting
     * for a value nothing is computing.
     */
    onClaimed() {
        this.claimed = true;
        if (this.done)
            this.stop();
    }
    /** The cache dropped this entry; the observation goes with it. */
    onEvicted() {
        this.stop();
    }
    stop() {
        this.released = true;
        this.store.detach(this);
        if (this.waiting.get(this.key) === this)
            this.waiting.delete(this.key);
        this.stopSync?.();
        this.stopSync = undefined;
        this.stopStore?.();
        this.stopStore = undefined;
        if (!this.done) {
            this.done = true;
            this.resolve();
        }
    }
}
const SUSPENSIONS = new WeakMap();
/**
 * What a component with no local answer should wait on, or nothing.
 *
 * `undefined` means do not suspend: either the session cannot produce a first
 * value right now, or the wait for this query is already over and the render
 * that resumes it reads the store directly.
 */
export const suspend = (database, key, store) => {
    const waiting = SUSPENSIONS.get(database) ?? new Map();
    SUSPENSIONS.set(database, waiting);
    const existing = waiting.get(key);
    if (existing !== undefined) {
        return existing.settled() ? undefined : existing.promise;
    }
    if (!reads(database))
        return undefined;
    const created = new QuerySuspension(database, store, waiting, key);
    if (!created.gone())
        waiting.set(key, created);
    return created.settled() ? undefined : created.promise;
};
export const suspendedQueryCount = (database) => SUSPENSIONS.get(database)?.size ?? 0;
//# sourceMappingURL=suspense.js.map