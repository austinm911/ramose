/** `db.live(q => …)` — a standing `db.q`, woken by this session's `t`. */

import type { RuntimeContext } from "alchemy/RuntimeContext";
import type * as Effect from "effect/Effect";
import type { QueryOptions } from "../Client.ts";
import type { Session } from "../Session.ts";
import type { AnyCatalog } from "./Catalog.ts";
import type {
  TypedReadDatabaseClient,
  TypedReadWriteDatabaseClient,
} from "./Client.ts";
import { isEid, type Eid } from "./Eid.ts";
import type { PullResult, ValidatePull } from "./Pull.ts";
import type {
  AttrSlot,
  BindClause,
  EntitySlot,
  QueryBuilder,
  QueryVar,
  ValueSlot,
} from "./Query.ts";

/** An external store, shaped for `useSyncExternalStore(s.subscribe, s.get)`. */
export interface LiveStore<T> {
  /** The current rows — `undefined` until the first result. Stable between changes. */
  get(): T | undefined;
  /** Called on every change. Returns the unsubscribe. */
  subscribe(cb: () => void): () => void;
  /** Stop following the socket. The last snapshot stays readable. */
  close(): void;
}

/** Run an Effect outside Effect — the services captured when the session opened. */
export type LiveRun = <A>(
  effect: Effect.Effect<A, unknown, RuntimeContext>,
) => Promise<A>;

/** @internal the query a live store re-runs. */
interface LiveNode<C extends AnyCatalog> {
  readonly builder: QueryBuilder<C, {}>;
  readonly eidVar: QueryVar;
  readonly pattern: unknown;
}

/** A built live query. `R` is the row type its store yields. */
export interface LiveQuery<C extends AnyCatalog = AnyCatalog, R = unknown> {
  /** @internal */
  readonly node: LiveNode<C>;
  /** @internal phantom carrying `R`; never present at runtime. */
  readonly rows: R;
}

/** Flatten the pull result and its `eid` into one row. */
type Simplify<T> = { readonly [K in keyof T]: T[K] };

/** One live row: the pull map's result, plus the entity it came from. */
export type LiveRow<C extends AnyCatalog, P> = Simplify<
  PullResult<C, P> & { readonly eid: Eid<C> }
>;

/** The vars in `B` bound as an entity — the only things live `find` accepts. */
export type EidVar<C extends AnyCatalog, B extends object> = {
  [K in keyof B]: [B[K]] extends [Eid<C>] ? K : never;
}[keyof B] &
  QueryVar;

/** A live `find`: rows of {@link Eid}, or of {@link LiveRow} once `.pull`ed. */
export interface LiveFind<C extends AnyCatalog = AnyCatalog>
  extends LiveQuery<C, readonly Eid<C>[]> {
  /**
   * The literate `eid.pull` map — run per row, `null` rows dropped.
   * `P &` keeps inference off the conditional; on its own it is unresolvable here.
   */
  pull<const P>(
    map: P & ValidatePull<C, P>,
  ): LiveQuery<C, readonly LiveRow<C, P>[]>;
}

/** `db.q`'s builder, minus the terminals that run once. */
export interface LiveQueryBuilder<
  C extends AnyCatalog = AnyCatalog,
  B extends object = {},
> {
  where<
    const E extends EntitySlot,
    const A extends AttrSlot<C>,
    const V extends ValueSlot<C, A>,
  >(
    e: E,
    a: A,
    v: V,
  ): LiveQueryBuilder<C, BindClause<C, B, E, A, V>>;

  /** Read fence / explain. `minT` is overridden by the session's basis. */
  options(opts: QueryOptions): LiveQueryBuilder<C, B>;

  /** Exactly one entity var. Value vars and unbound vars are type errors. */
  find<const V extends EidVar<C, B>>(v: V): LiveFind<C>;
}

/**
 * A standing `q` + `pull`, re-run whenever this session's basis moves.
 *
 * @example
 * ```typescript
 * const users = db.live((q) =>
 *   q.where("?e", User.name, "_").find("?e").pull({ name: User.name }),
 * );
 * // React: useSyncExternalStore(users.subscribe, users.get)
 * const off = users.subscribe(() => render(users.get()));
 * ```
 */
export type LiveFn<C extends AnyCatalog = AnyCatalog> = <R>(
  build: (q: LiveQueryBuilder<C, {}>) => LiveQuery<C, R>,
) => LiveStore<R>;

/** A read-write client that also holds a socket, so it can stand a query up. */
export interface TypedLiveDatabaseClient<C extends AnyCatalog = AnyCatalog>
  extends TypedReadWriteDatabaseClient<C> {
  readonly live: LiveFn<C>;
}

const eidsOf = (result: unknown): Eid[] => {
  if (!Array.isArray(result)) return [];
  const out: Eid[] = [];
  for (const row of result) {
    const cell = Array.isArray(row) ? row[0] : row;
    if (isEid(cell)) out.push(cell);
  }
  return out;
};

const makeStore = <C extends AnyCatalog, R>(
  node: LiveNode<C>,
  session: Session,
  run: LiveRun,
): LiveStore<R> => {
  const subscribers = new Set<() => void>();
  let snapshot: R | undefined;
  let basis: number | undefined;
  let inFlight = false;
  let wanted: number | undefined;
  let closed = false;
  let off: (() => void) | undefined;

  /** One pass: the q at the fence, then a pull per row. */
  const settle = async (minT: number | undefined): Promise<void> => {
    const res = await run(
      node.builder
        .options(minT === undefined ? {} : { minT })
        .query(node.eidVar),
    );
    // nothing moved, so neither does the snapshot's reference
    if (closed || res.t === basis) return;

    const eids = eidsOf(res.result);
    let rows: unknown[] = eids;
    if (node.pattern !== undefined) {
      const pulled = await Promise.all(
        eids.map((eid) => run(eid.pull(node.pattern as never, { minT: res.t }))),
      );
      if (closed) return;
      rows = [];
      pulled.forEach((row, i) => {
        if (row !== null && row !== undefined) rows.push({ ...row, eid: eids[i] });
      });
    }

    basis = res.t;
    snapshot = rows as R;
    // copy: a subscriber may unsubscribe itself while being notified
    for (const cb of [...subscribers]) cb();
  };

  /**
   * One pass at a time — a `t` seen mid-pass (the pass's own reply carries one)
   * is drained after it, and only if the pass did not already reach it. A pass
   * that fails leaves the last good snapshot in place.
   */
  const refresh = (minT: number | undefined): void => {
    if (closed) return;
    if (inFlight) {
      wanted = Math.max(wanted ?? 0, minT ?? 0);
      return;
    }
    inFlight = true;
    void settle(minT)
      .catch(() => {})
      .finally(() => {
        inFlight = false;
        const next = wanted;
        wanted = undefined;
        if (next !== undefined && next > (basis ?? 0)) refresh(next);
      });
  };

  off = session.onT(refresh);
  refresh(session.t > 0 ? session.t : undefined);

  return {
    get: () => snapshot,
    subscribe: (cb) => {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    close: () => {
      closed = true;
      off?.();
      off = undefined;
    },
  };
};

const liveFind = <C extends AnyCatalog>(node: LiveNode<C>): LiveFind<C> =>
  ({
    node,
    pull: (map: unknown) => ({ node: { ...node, pattern: map } }),
  }) as unknown as LiveFind<C>;

const liveBuilder = <C extends AnyCatalog, B extends object>(
  builder: QueryBuilder<C, {}>,
): LiveQueryBuilder<C, B> =>
  ({
    where: (e: EntitySlot, a: unknown, v: unknown) =>
      liveBuilder(
        builder.where(e, a as never, v as never) as unknown as QueryBuilder<C, {}>,
      ),
    options: (opts: QueryOptions) => liveBuilder(builder.options(opts)),
    find: (v: QueryVar) => liveFind({ builder, eidVar: v, pattern: undefined }),
  }) as unknown as LiveQueryBuilder<C, B>;

/**
 * Build `db.live` for a client that rides a session socket. The store starts
 * following `session.onT` at once and keeps doing so until `close()`.
 */
export const makeLive = <C extends AnyCatalog>(
  db: TypedReadDatabaseClient<C>,
  session: Session,
  run: LiveRun,
): LiveFn<C> =>
  // cast, not inference: relating two builder types walks `where` forever
  ((build: (q: LiveQueryBuilder<C, {}>) => LiveQuery<C, unknown>) =>
    makeStore(
      build(liveBuilder<C, {}>(db.q())).node,
      session,
      run,
    )) as unknown as LiveFn<C>;
