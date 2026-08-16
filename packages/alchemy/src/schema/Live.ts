/** `db.live(q => …)` — a standing `db.q`, woken by this session's `t`. */

import type { RuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
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
  /** Why the last pass failed, if it did. Cleared by the next good one. */
  readonly error: unknown;
  /** Called on every change. Returns the unsubscribe. */
  subscribe(cb: () => void): () => void;
  /** Stop following the socket. The last snapshot stays readable. */
  close(): void;
}

/** @internal */
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
  // `Omit`: a map with its own `eid` key loses it, exactly as the row does
  Omit<PullResult<C, P>, "eid"> & { readonly eid: Eid<C> }
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

/** A standing `q` + `pull`, re-run whenever this session's basis moves. */
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

/** Pulls in flight per pass, and the retry backoff bounds in ms. */
const PULL_CONCURRENCY = 16;
const RETRY_MIN = 250;
const RETRY_MAX = 5000;

const makeStore = <C extends AnyCatalog, R>(
  node: LiveNode<C>,
  session: Session,
  run: LiveRun,
): LiveStore<R> => {
  const subscribers = new Set<() => void>();
  let snapshot: R | undefined;
  let error: unknown;
  let basis: number | undefined;
  let inFlight = false;
  let wanted: number | undefined;
  let backoff = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let off: (() => void) | undefined;
  let offClose: (() => void) | undefined;

  // copy: a subscriber may unsubscribe itself while being notified
  const notify = (): void => {
    for (const cb of [...subscribers]) cb();
  };

  const settle = async (minT: number | undefined): Promise<boolean> => {
    const res = await run(
      node.builder
        .options(minT === undefined ? {} : { minT })
        .query(node.eidVar),
    );
    // the basis only moves forward, so neither does the snapshot's reference
    if (closed || res.t <= (basis ?? -1)) return false;

    const eids = eidsOf(res.result);
    let rows: unknown[] = eids;
    if (node.pattern !== undefined) {
      // minT is a floor, not a pin: rows may straddle bases, the next `t` reconciles
      const pulled = await run(
        Effect.forEach(
          eids,
          (eid) =>
            eid
              .pull(node.pattern as never, { minT: res.t })
              .pipe(Effect.orElseSucceed(() => null)),
          { concurrency: PULL_CONCURRENCY },
        ),
      );
      if (closed) return false;
      rows = [];
      pulled.forEach((row, i) => {
        if (row !== null && row !== undefined) rows.push({ ...row, eid: eids[i] });
      });
    }

    basis = res.t;
    snapshot = rows as R;
    return true;
  };

  const refresh = (minT: number | undefined): void => {
    if (closed) return;
    if (inFlight) {
      wanted = Math.max(wanted ?? 0, minT ?? 0);
      return;
    }
    inFlight = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    let failed = false;
    void settle(minT)
      .then(
        (published) => {
          const recovered = error !== undefined;
          error = undefined;
          backoff = 0;
          if (!closed && (published || recovered)) notify();
        },
        (cause: unknown) => {
          failed = true;
          error = cause;
          if (!closed) notify();
        },
      )
      .finally(() => {
        inFlight = false;
        const next = wanted;
        wanted = undefined;
        if (closed) return;
        if (failed) {
          backoff = backoff === 0 ? RETRY_MIN : Math.min(backoff * 2, RETRY_MAX);
          timer = setTimeout(() => refresh(next ?? minT), backoff);
          return;
        }
        if (next !== undefined && next > (basis ?? 0)) refresh(next);
      });
  };

  const close = (): void => {
    closed = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    off?.();
    off = undefined;
    offClose?.();
    offClose = undefined;
  };

  off = session.onT(refresh);
  offClose = session.onClose(close);
  refresh(session.t > 0 ? session.t : undefined);

  return {
    get: () => snapshot,
    get error() {
      return error;
    },
    subscribe: (cb) => {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    close,
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

/** @internal wired up by `SchemaFx.Session.connect`. */
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
