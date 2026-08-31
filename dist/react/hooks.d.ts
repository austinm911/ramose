import { type ReactElement, type ReactNode } from "react";
import type { AnyComposer } from "../db/Composer.ts";
import type { QueryObject } from "../db/query/index.ts";
import type { Client, ClientDatabase, ClientValue, EntityFocused, EntityResult, MutationNamespace, Receipt, SyncState } from "../client/index.ts";
import { type QueryState } from "./query-state.ts";
import { type ReceiptView } from "./receipt-state.ts";
export type RamoseProviderProps = {
    readonly client: Client;
    readonly children?: ReactNode;
};
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
export declare const RamoseProvider: (props: RamoseProviderProps) => ReactElement;
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
export declare const useDb: <Mutations = MutationNamespace>() => ClientDatabase<Mutations>;
/**
 * Observe one query and re-render when its answer changes.
 *
 * ```tsx
 * const issues = useQuery(db.query.from(Issue).where({ status: "open" }));
 * if (issues.status === "pending") return <Spinner />;
 * if (issues.status === "error") return <Failed error={issues.error} />;
 * return <List rows={issues.data} stale={issues.status === "stale"} />;
 * ```
 *
 * The query value is the portable one, built inline: it is inert, and its
 * *canonical identity* rather than its object identity is what selects the
 * observation, so rebuilding an equal query on every render observes the same
 * thing. Two components asking the same question share one observation, one
 * store, and one snapshot object.
 *
 * `database` defaults to the nearest provider's root. Pass it explicitly to
 * read a handle this tree does not provide.
 *
 * Server rendering: the server snapshot is always `pending`. Query answers are
 * local browser state, so there is nothing to serialize and nothing to hydrate;
 * the first client render after hydration reads the real one.
 */
export declare function useQuery<N extends AnyComposer, Row, Out>(query: EntityFocused<N, Row, Out>, database?: ClientDatabase): QueryState<EntityResult<N, Row, Out>>;
export declare function useQuery<Row, Out>(query: QueryObject<Row, Out>, database?: ClientDatabase): QueryState<ClientValue<Out>>;
/**
 * Observe one query and wait, under the nearest `<Suspense>`, for its first
 * local answer.
 *
 * ```tsx
 * const issues = useSuspenseQuery(db.query.from(Issue));
 * if (issues.status === "pending") return <NothingCachedYet />;
 * return <List rows={issues.data} stale={issues.status === "stale"} />;
 * ```
 *
 * This waits for *loading*, never for connectivity. It suspends only while
 * this query has no local answer at all **and** the session could still
 * produce one — a cold start, or a scope this replica has not covered yet. It
 * does not suspend when a local answer exists: a restored replica with an
 * unreachable server renders `stale` immediately, which is the case Ramose
 * exists for and the one a spinner would be wrong about.
 *
 * `pending` therefore still reaches the component, and means something
 * narrower than it does in {@link useQuery}: there is no local answer *and*
 * the session cannot currently produce one, because it is offline, closed,
 * unauthorized, or behind the deployed build. Render what an empty offline
 * scope should look like; a fallback would be a wait with no end. The
 * component re-renders with the answer if the session later delivers one.
 *
 * A fence is not one of those. A scope that is cleared or handed to another
 * principal withdraws its value and activates again, and this keeps waiting
 * across that — until the activation answers, or fails into one of the states
 * above.
 *
 * The observation this waits on is held outside the component, because React
 * discards a component that suspends and nothing in its lifetime would be left
 * to compute the value. It is handed to the component's own subscription at
 * the commit that resumes it, and released with the query's cache entry if no
 * commit ever comes.
 *
 * Errors are returned, not thrown: a query that cannot be answered against the
 * local view is a state this adapter reports the same way in both hooks,
 * rather than a second failure channel that only one of them uses.
 *
 * Server rendering: this never suspends outside a browser. A server render has
 * no local replica to wait for, so it reads `pending` exactly as
 * {@link useQuery} does.
 */
export declare function useSuspenseQuery<N extends AnyComposer, Row, Out>(query: EntityFocused<N, Row, Out>, database?: ClientDatabase): QueryState<EntityResult<N, Row, Out>>;
export declare function useSuspenseQuery<Row, Out>(query: QueryObject<Row, Out>, database?: ClientDatabase): QueryState<ClientValue<Out>>;
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
export declare const useReceipt: (receipt?: Receipt | null) => ReceiptView;
export declare const useSyncState: (source?: Client | ClientDatabase) => SyncState;
//# sourceMappingURL=hooks.d.ts.map