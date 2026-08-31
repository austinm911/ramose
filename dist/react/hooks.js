import { createContext, createElement, useContext, useSyncExternalStore, } from "react";
import { queryObservationKey } from "../client/database.js";
import { PENDING } from "./query-state.js";
import { IDLE } from "./receipt-state.js";
import { queryStore } from "./store.js";
import { suspend, watchLocal } from "./suspense.js";
const ClientContext = createContext(undefined);
/**
 * Bind one client to a React tree.
 *
 * The client is the application's, constructed wherever it wants one —
 * typically once at module scope, since construction is inert. This provider
 * neither creates nor closes it: a component that owned a client's lifetime
 * would tie a network session to a render tree, and an unmount would take the
 * whole application's synchronization down with it.
 *
 * This is a client-component boundary: the hooks below read browser storage and
 * subscribe to a live session, so the provider and everything using it run on
 * the client. Nothing here has a server rendering path to protect.
 */
export const RamoseProvider = (props) => createElement(ClientContext.Provider, { value: props.client }, props.children);
const useClient = () => {
    const client = useContext(ClientContext);
    if (client === undefined) {
        throw new Error("ramose/react: no <RamoseProvider client={...}> in this tree");
    }
    return client;
};
/**
 * The configured root database of the nearest provider's client.
 *
 * `open()` is interned and inert, so calling it while rendering costs one map
 * read and activates nothing.
 *
 * A terminal client — one that was closed, cleared, or fenced — throws here, as
 * it does everywhere else. That is deliberate rather than softened into an
 * empty render: those states are terminal for the *instance*, an application
 * recovers by constructing a new client, and a tree that keeps rendering
 * against the old one is asking a question that no longer has an answer. Swap
 * the client on the provider (or unmount the tree) as part of closing it.
 *
 * A React context holds one client for a whole tree and cannot carry that
 * client's catalog into each consumer's types, so this answers the runtime
 * namespace by default. Name the catalog's namespace —
 * `useDb<DatabaseMutations<typeof AppSchema>>()` — or hold the typed client's
 * own `open()` at module scope, to read `db.mutate` with the catalog's exact
 * operations.
 */
export const useDb = () => useClient().open();
const pendingOnServer = () => PENDING;
const IN_BROWSER = typeof document !== "undefined";
/** The database, key and interned store one query hook reads. */
const observation = (query, database, provided, hook) => {
    const db = database ?? provided?.open();
    if (db === undefined) {
        throw new Error(`ramose/react: ${hook} needs a <RamoseProvider> or an explicit database`);
    }
    watchLocal(db);
    const key = queryObservationKey(query);
    return {
        db,
        key,
        store: queryStore(db, key, () => db.observe(query)),
    };
};
export function useQuery(query, database) {
    const observed = observation(query, database, useContext(ClientContext), "useQuery");
    return useSyncExternalStore(observed.store.subscribe, observed.store.getSnapshot, pendingOnServer);
}
export function useSuspenseQuery(query, database) {
    const observed = observation(query, database, useContext(ClientContext), "useSuspenseQuery");
    if (IN_BROWSER && observed.store.getSnapshot().status === "pending") {
        const waiting = suspend(observed.db, observed.key, observed.store);
        if (waiting !== undefined)
            throw waiting;
    }
    return useSyncExternalStore(observed.store.subscribe, observed.store.getSnapshot, pendingOnServer);
}
const stopNothing = () => undefined;
const observeNothing = () => stopNothing;
const readIdle = () => IDLE;
/**
 * Observe one invocation and re-render as it settles.
 *
 * ```tsx
 * const [receipt, setReceipt] = useState<Receipt | null>(null);
 * const state = useReceipt(receipt);
 * return (
 *   <>
 *     <button onClick={() => setReceipt(db.mutate.createIssue({ title }))}>
 *       {state.status === "pending" || state.status === "queued"
 *         ? "Saving…"
 *         : "Save"}
 *     </button>
 *     {state.status === "rejected" ? <Refused code={state.error.code} /> : null}
 *   </>
 * );
 * ```
 *
 * A receipt is already the external store this hook needs — it carries its own
 * `subscribe` and `getSnapshot`, both frozen onto it when the invocation was
 * created — so there is nothing to intern. Two receipts are two invocations,
 * never the same one under a different name, and a receipt is reachable only
 * from the code that holds it: the query cache exists because a query *value*
 * is rebuilt on every render and must select an existing observation, and
 * neither half of that applies here.
 *
 * `null` and `undefined` read as `idle`, so a component may call this hook
 * unconditionally on the render before its user acts. Hold the receipt in state
 * rather than rebuilding it: calling a mutation while rendering would invoke
 * once per render.
 *
 * Nothing is cancelled by unmounting. A queued invocation is durable and
 * proceeds without an observer; a later component given the same receipt reads
 * whatever state it reached in the meantime, terminal states included.
 */
export const useReceipt = (receipt) => useSyncExternalStore(receipt?.subscribe ?? observeNothing, receipt?.getSnapshot ?? readIdle, receipt?.getSnapshot ?? readIdle);
export const useSyncState = (source) => {
    const provided = useContext(ClientContext);
    const sync = (source ?? provided)?.sync;
    if (sync === undefined) {
        throw new Error("ramose/react: useSyncState needs a <RamoseProvider> or an explicit client");
    }
    return useSyncExternalStore(sync.subscribe, sync.getSnapshot, sync.getSnapshot);
};
//# sourceMappingURL=hooks.js.map