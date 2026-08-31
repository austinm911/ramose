/**
 * `useQuery` / `useSuspenseQuery` — one query observed as component state.
 *
 * `ClientDatabase.observe` is already a standing subscription over the local
 * replica, so there is no live/one-shot split left to expose: both hooks here
 * read the same interned store, and the only difference is whether a component
 * with no local answer yet waits or renders `pending`.
 */

import { useContext, useSyncExternalStore } from "octane";
import type { AnyComposer } from "../db/Composer.ts";
import type { QueryObject } from "../db/query/index.ts";
import { queryObservationKey } from "../client/database.ts";
import type {
  Client,
  ClientDatabase,
  ClientValue,
  EntityFocused,
  EntityResult,
} from "../client/index.ts";
// `../react/*` below is the framework-neutral half of the React adapter — no
// React import anywhere in it. Both bindings share these so the observation
// cache, the snapshot narrowing and the suspension bookkeeping cannot drift.
import { PENDING, type QueryState } from "../react/query-state.ts";
import { queryStore, type QueryStore } from "../react/store.ts";
import { suspend, watchLocal } from "../react/suspense.ts";
import { RamoseContext } from "./hooks.ts";
import { splitSlot, subSlot } from "./internal.ts";

export type { QueryState } from "../react/query-state.ts";

const pendingOnServer = (): QueryState<never> => PENDING;

const IN_BROWSER = typeof document !== "undefined";

type Observation<Out> = {
  readonly db: ClientDatabase;
  readonly key: string;
  readonly store: QueryStore<ClientValue<Out>>;
};

/** The database, key and interned store one query hook reads. */
const observation = <Out>(
  query: QueryObject<unknown, Out>,
  database: ClientDatabase | undefined,
  provided: Client | null,
  hook: string,
): Observation<Out> => {
  const db = database ?? provided?.open();
  if (db === undefined) {
    throw new Error(
      `ramose/octane: ${hook} needs a <RamoseProvider> or an explicit database`,
    );
  }
  watchLocal(db);
  const key = queryObservationKey(query);
  return {
    db,
    key,
    store: queryStore<ClientValue<Out>>(db, key, () => db.observe(query)),
  };
};

/**
 * Observe one query and re-render when its answer changes.
 *
 * `pending` means no local value has been derived for this query yet — a cold
 * start, an unconfirmed replica, or a fenced principal. It is not "offline":
 * a restored replica with an unreachable server reads `stale` with real data.
 *
 * The query value is the portable one, built inline: its *canonical identity*
 * rather than its object identity selects the observation, so rebuilding an
 * equal query every render observes the same thing, and two components asking
 * the same question share one store and one snapshot object.
 *
 * `database` defaults to the nearest provider's root. It is read through the
 * context directly rather than through `useRamose()`, because an explicit
 * handle has to work with no provider anywhere above the component.
 *
 * Server rendering reads `pending` and subscribes to nothing: query answers
 * are local browser state, with nothing to serialize and nothing to hydrate.
 */
export function useQuery<N extends AnyComposer, Row, Out>(
  query: EntityFocused<N, Row, Out>,
  database?: ClientDatabase,
): QueryState<EntityResult<N, Row, Out>>;
export function useQuery<Row, Out>(
  query: QueryObject<Row, Out>,
  database?: ClientDatabase,
): QueryState<ClientValue<Out>>;
export function useQuery<Row, Out>(
  query: QueryObject<Row, Out>,
  ...rest: [database?: ClientDatabase, slot?: symbol]
): QueryState<ClientValue<Out>> {
  const [args, slot] = splitSlot(rest);
  const [database] = args as [ClientDatabase?];
  const observed = observation<Out>(
    query,
    database,
    useContext(RamoseContext),
    "useQuery",
  );
  return useSyncExternalStore(
    observed.store.subscribe,
    observed.store.getSnapshot,
    pendingOnServer,
    subSlot(slot, "query:store"),
  );
}

/**
 * Observe one query and wait, under the nearest suspense boundary, for its
 * first local answer.
 *
 * This waits for *loading*, never for connectivity. It suspends only while the
 * query has no local answer at all **and** the session could still produce
 * one. A restored replica with an unreachable server renders immediately as
 * `stale`, which is the case Ramose exists for and the one a spinner would be
 * wrong about.
 *
 * So `pending` still reaches the component, meaning something narrower than in
 * {@link useQuery}: there is no local answer *and* the session cannot produce
 * one right now — offline, closed, unauthorized, or behind the deployed build.
 * Render what an empty offline scope should look like; a fallback here would
 * be a wait with no end.
 *
 * Errors are returned, not thrown, exactly as in {@link useQuery}: a query the
 * local view cannot answer is one reported state, not a second channel that
 * only one hook uses.
 *
 * Server rendering never suspends: there is no local replica to wait for, so
 * it reads `pending`.
 */
export function useSuspenseQuery<N extends AnyComposer, Row, Out>(
  query: EntityFocused<N, Row, Out>,
  database?: ClientDatabase,
): QueryState<EntityResult<N, Row, Out>>;
export function useSuspenseQuery<Row, Out>(
  query: QueryObject<Row, Out>,
  database?: ClientDatabase,
): QueryState<ClientValue<Out>>;
export function useSuspenseQuery<Row, Out>(
  query: QueryObject<Row, Out>,
  ...rest: [database?: ClientDatabase, slot?: symbol]
): QueryState<ClientValue<Out>> {
  const [args, slot] = splitSlot(rest);
  const [database] = args as [ClientDatabase?];
  const observed = observation<Out>(
    query,
    database,
    useContext(RamoseContext),
    "useSuspenseQuery",
  );
  if (IN_BROWSER && observed.store.getSnapshot().status === "pending") {
    const waiting = suspend(observed.db, observed.key, observed.store);
    if (waiting !== undefined) throw waiting;
  }
  return useSyncExternalStore(
    observed.store.subscribe,
    observed.store.getSnapshot,
    pendingOnServer,
    subSlot(slot, "query:store"),
  );
}
