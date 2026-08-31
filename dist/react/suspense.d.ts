import type { ClientDatabase } from "../client/index.ts";
import { type QueryStore } from "./store.ts";
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
export declare const watchLocal: (database: ClientDatabase) => void;
/**
 * What a component with no local answer should wait on, or nothing.
 *
 * `undefined` means do not suspend: either the session cannot produce a first
 * value right now, or the wait for this query is already over and the render
 * that resumes it reads the store directly.
 */
export declare const suspend: (database: ClientDatabase, key: string, store: QueryStore<unknown>) => Promise<void> | undefined;
export declare const suspendedQueryCount: (database: ClientDatabase) => number;
//# sourceMappingURL=suspense.d.ts.map