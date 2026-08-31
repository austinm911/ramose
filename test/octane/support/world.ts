/**
 * The world every test file here shares: the todo catalog, the hoisted query
 * values, a client the provider can carry, and the capture box a `.tsrx`
 * fixture reports its render values through.
 *
 * The client is a stand-in rather than `createClient`, and that is forced.
 * Upstream's client answers from an IndexedDB replica held under a Web Locks
 * leader election; happy-dom ships neither. `createClient` itself is inert and
 * would construct fine, but the first `observe` activates storage and the
 * session never reaches a readable state — so no assertion about `ready`,
 * `stale`, a receipt or a sync transition could be made against the real one
 * here. Driving the real client is what `test/browser/*.browser.test.ts` does,
 * on the Playwright runner with a real IndexedDB.
 *
 * What this drives instead is the seam the client's own unit tests drive: the
 * stores it publishes through. `Store`, `ReceiptDriver`, `syncState`,
 * `clientQueryFrom` and `queryObservationKey` below are the client's own, not
 * copies — so a hook observes the same object graph the real client publishes
 * and selects observations by the same key it would. Only the source of the
 * values is faked: a test says them, instead of a replica computing them.
 */

import {
  Entity,
  Field,
  invocationId,
  Query,
  Schema,
  string,
  type AnyQueryObject,
} from "ramose/db";
import {
  ClientClosedError,
  type Client,
  type ClientDatabase,
  type MutationNamespace,
  type Receipt,
  type Subscription,
  type SyncStatus,
} from "ramose/client";
import {
  queryObservationKey,
  type ClientDatabaseReads,
  type QuerySnapshot,
} from "../../../packages/ramose/src/client/database.ts";
import {
  clientQueryFrom,
  type GraphAncestor,
} from "../../../packages/ramose/src/client/graph.ts";
import { ReceiptDriver } from "../../../packages/ramose/src/client/receipt.ts";
import { Store } from "../../../packages/ramose/src/client/subscription.ts";
import { syncState, type SyncState } from "../../../packages/ramose/src/client/sync.ts";
// The observation cache and the suspension bookkeeping the octane binding
// shares with `ramose/react`. Re-exported so a test can assert on them without
// reaching past this module.
export {
  heldStoreCount,
  UNCLAIMED_LIMIT,
} from "../../../packages/ramose/src/react/store.ts";
export { suspendedQueryCount } from "../../../packages/ramose/src/react/suspense.ts";

export const Todo = Entity("todo", { title: Field(string()) });
export const Todos = Schema("octane-todos", { todo: Todo });
Todos.applyPolicy(() => {});

/** Hoisted, as every consumer must hoist them: `query` is an identity dep. */
export const titles = Query.from(Todo).select({ title: Todo.title });
export const allTodos = Query.from(Todo).ids();
export const oneTodo = Query.from(Todo).ids().limit(1);
export const shape = { title: Todo.title };

/** Every pass is a handful of microtasks; a beat is plenty. */
export const sleep = (ms = 25): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
};

/** Entity ids in the shape rows carry them — `IdRow` is `{ id }`. */
export const ids = (...ns: number[]): readonly { readonly id: number }[] =>
  ns.map((id) => ({ id }));

const PENDING: QuerySnapshot<unknown> = Object.freeze({
  status: "pending" as const,
  data: undefined,
  stale: true,
  error: undefined,
});

const answered = (data: unknown, stale: boolean): QuerySnapshot<unknown> =>
  Object.freeze({ status: "ready" as const, data, stale, error: undefined });

/**
 * One invocation, and the four reports that settle it.
 *
 * The driver is the client's own `ReceiptDriver`, so `receipt` is exactly what
 * `db.mutate.…()` hands back in production — same promises, same state
 * machine, same refusal to be unsettled twice.
 */
export interface Invocation {
  readonly name: string;
  readonly input: unknown;
  readonly receipt: Receipt;
  /** Durably in the outbox. */
  readonly queue: () => void;
  /** The authoritative server accepted it. */
  readonly commit: () => void;
  /** The server refused it, with its own classification. */
  readonly reject: (code: string) => void;
  /** It never reached the outbox; nothing durable exists. */
  readonly fail: (error: Error) => void;
}

/** A drivable receipt with no client behind it, for the `useReceipt` cases. */
export const invocation = (name = "mutate"): Invocation => {
  const driver = new ReceiptDriver(invocationId());
  return {
    name,
    input: undefined,
    receipt: driver.receipt,
    queue: () => driver.queue(),
    commit: () => driver.commit(),
    reject: (code) => driver.reject(code),
    fail: (error) => driver.fail(error),
  };
};

/**
 * A `ClientDatabase` whose answers a test says out loud.
 *
 * `query.from` is built with the client's own `clientQueryFrom`, not wrapped
 * around the portable builder, so a query built here carries the entity-focus
 * brand and keys exactly as the real client's would. `GraphAncestor` is
 * implemented only because that decorator wants one: the stubs below are
 * reached from `.one()` / `.oneOrFail()` on a graph-composing entity, and
 * `Todo` is not one.
 *
 * That fidelity has a consequence worth knowing before writing a test.
 * `db.query.from(Todo).ids()` and a hoisted `Query.from(Todo).ids()` are two
 * different observations — the focus is part of the key, upstream's own
 * `queryObservationKey` tests pin that — so answer a query through the same
 * value the component observes. The hoisted ones above are the normal choice.
 */
class TestDatabase implements ClientDatabaseReads, GraphAncestor {
  readonly query = { from: clientQueryFrom(this) };
  readonly syncStore = new Store<SyncState>(syncState("idle"));
  readonly sync = this.syncStore.subscription;
  readonly invocations: Invocation[] = [];

  private readonly answers = new Map<string, Store<QuerySnapshot<unknown>>>();

  readonly observe = ((query: AnyQueryObject) =>
    this.storeFor(query).subscription) as unknown as
      ClientDatabaseReads["observe"];

  readonly mutate: MutationNamespace = new Proxy(
    {} as MutationNamespace,
    {
      get: (_target, name) => {
        // `await db.mutate` and structural probes must not mint invocations.
        if (typeof name !== "string" || name === "then") return undefined;
        return (input?: unknown): Receipt => {
          const record = { ...invocation(name), input };
          this.invocations.push(record);
          return record.receipt;
        };
      },
    },
  );

  storeFor(query: AnyQueryObject): Store<QuerySnapshot<unknown>> {
    const key = queryObservationKey(query);
    const existing = this.answers.get(key);
    if (existing !== undefined) return existing;
    const store = new Store<QuerySnapshot<unknown>>(PENDING);
    this.answers.set(key, store);
    return store;
  }

  readonly binding: Subscription<unknown> = Object.freeze({
    subscribe: () => () => undefined,
    getSnapshot: () => this,
  });
  activateGraph(): void {}
  boundDatabase(): undefined {
    return undefined;
  }
  bindingFailure(): undefined {
    return undefined;
  }
  graphChild(): never {
    throw new Error("test/octane: this world has no graph children");
  }
}

/** What `todoWorld()` hands a test. */
export interface TodoWorld {
  /** Provider props are `{ client }`; this is the client to put in them. */
  readonly client: Client;
  /** The interned root handle — the same object `client.open()` returns. */
  readonly db: ClientDatabase;

  /** Publish a session-confirmed answer for one query. */
  readonly answer: (query: AnyQueryObject, data: unknown) => void;
  /**
   * Publish an answer over a local value the session has not confirmed.
   *
   * Pass the same `data` reference as a prior `answer` to hold its identity
   * across the transition, exactly as the client does.
   */
  readonly answerStale: (query: AnyQueryObject, data: unknown) => void;
  /** Publish a failure to answer against the local view. */
  readonly failQuery: (query: AnyQueryObject, error: Error) => void;
  /** Withdraw the answer: back to `pending`, as a fence leaves it. */
  readonly resetQuery: (query: AnyQueryObject) => void;
  /** How many listeners currently hold this query's observation. */
  readonly observers: (query: AnyQueryObject) => number;

  /** Move both the client's and the database's session to `status`. */
  readonly sync: (status: SyncStatus) => void;
  /** Move only the client's, to prove which one a hook read. */
  readonly clientSync: (status: SyncStatus) => void;
  /** Move only the database's. */
  readonly databaseSync: (status: SyncStatus) => void;

  /** Every invocation `db.mutate.…()` has minted, in call order. */
  readonly invocations: readonly Invocation[];
  /** Invoke through `db.mutate` and keep the handle that settles it. */
  readonly invoke: (name: string, input?: unknown) => Invocation;

  /** Make the client terminal: `open()` throws and the session reads `closed`. */
  readonly close: () => void;
}

/**
 * A world whose session is already readable, with no query answered yet.
 *
 * `live` is the default because it is the state every hook assertion starts
 * from: a query with no local answer under a session that could still produce
 * one is what `useSuspenseQuery` suspends on, and what `useQuery` reports as
 * `pending`. Pass a status to start anywhere else.
 *
 * Start there rather than moving there. `suspense.ts` latches the fact that a
 * database once reported a local value, and only `connecting` withdraws it —
 * so a world that rendered under `live` and then went `offline` still suspends,
 * which is the production behaviour and not what a "nothing cached, offline"
 * case wants. For that case construct the world with `"offline"`.
 */
export const todoWorld = (status: SyncStatus = "live"): TodoWorld => {
  const db = new TestDatabase();
  const clientSyncStore = new Store<SyncState>(syncState(status));
  db.syncStore.publish(syncState(status));
  let terminal: "closed" | "cleared" | undefined;

  const publish = (query: AnyQueryObject, snapshot: QuerySnapshot<unknown>): void => {
    db.storeFor(query).publish(snapshot);
  };
  const both = (next: SyncState): void => {
    clientSyncStore.publish(next);
    db.syncStore.publish(next);
  };

  const terminate = (reason: "closed" | "cleared"): void => {
    terminal = reason;
    both(syncState("closed"));
  };

  const client: Client = {
    open: () => {
      if (terminal !== undefined) {
        throw new ClientClosedError({ operation: "open", reason: terminal });
      }
      return db;
    },
    sync: clientSyncStore.subscription,
    close: async () => terminate("closed"),
    clearLocalData: async () => terminate("cleared"),
  };

  return {
    client,
    db,

    answer: (query, data) => publish(query, answered(data, false)),
    answerStale: (query, data) => publish(query, answered(data, true)),
    failQuery: (query, error) =>
      publish(
        query,
        Object.freeze({
          status: "error" as const,
          data: undefined,
          stale: false,
          error,
        }),
      ),
    resetQuery: (query) => publish(query, PENDING),
    observers: (query) => db.storeFor(query).size,

    sync: (next) => both(syncState(next)),
    clientSync: (next) => clientSyncStore.publish(syncState(next)),
    databaseSync: (next) => db.syncStore.publish(syncState(next)),

    invocations: db.invocations,
    invoke: (name, input) => {
      db.mutate[name]!(input);
      return db.invocations[db.invocations.length - 1]!;
    },

    close: () => terminate("closed"),
  };
};

/**
 * What a fixture reports out of its render, so a test can assert on the value
 * itself — a `QueryState`, an object identity, a `Transact` — and not only on
 * the text it serialised into the DOM.
 */
export interface Capture<T> {
  /** Every value reported, oldest first: how many renders, and what each saw. */
  readonly renders: T[];
  /** Hand this to a fixture's `report` prop. */
  readonly report: (value: T) => void;
  /** The latest value reported. */
  last(): T;
}

export const capture = <T>(): Capture<T> => {
  const renders: T[] = [];
  return {
    renders,
    report: (value) => {
      renders.push(value);
    },
    last: () => renders[renders.length - 1]!,
  };
};
