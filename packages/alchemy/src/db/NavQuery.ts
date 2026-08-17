/**
 * Navigational query values — the primary surface from docs/QUERY.md.
 *
 * `Ripple.query(Todo).where(...).select(...).orderBy(...).limit(n)` builds a
 * {@link NavQuery} value. `db.q` / `db.live` run it. Datalog is the IR: we
 * lower to `{ find: [["pull", "?e", pattern]], where }` so the peer does
 * pull-in-query (no client N+1).
 *
 * `.orderBy` / `.limit` are applied client-side on the projected rows until
 * the core AST gains top-level order/limit (QUERY.md §11 P0 #5).
 */

import { lowerAttr } from "./attrRef.ts";
import type { AnyAttribute } from "./Attribute.ts";
import type { AnyNamespace } from "./Namespace.ts";
import {
  inspectPullField,
  isPullNested,
  isPullOptional,
  lowerPullPattern,
  nested,
  optional,
  reshapePullResult,
} from "./Pull.ts";

// ── markers ────────────────────────────────────────────────────────────────

export type PredTag =
  | "eq"
  | "ne"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "startsWith"
  | "includes"
  | "exists"
  | "missing";

/** A closed predicate over a path of attribute idents from the query root. */
export interface Predicate {
  readonly _tag: "Predicate";
  readonly op: PredTag;
  /** Idents from the root entity, e.g. `[":todo/owner", ":user/name"]`. */
  readonly path: readonly string[];
  readonly value?: unknown;
}

export type ShapeField =
  | AnyAttribute
  | PathCarrier
  | { readonly _tag: "optional"; readonly field: unknown }
  | { readonly _tag: "nested"; readonly attr: unknown; readonly pattern: unknown }
  | { readonly _tag: "select"; readonly attr: unknown; readonly shape: Shape };

export type Shape = { readonly [key: string]: ShapeField };

export type OrderEmpty = "first" | "last";
export type OrderDir = "asc" | "desc";

export interface OrderBy {
  readonly path: readonly string[];
  /** Result key to sort by when the path was also selected under this name. */
  readonly key?: string;
  readonly dir: OrderDir;
  readonly empty: OrderEmpty;
}

export interface NavQuerySpec {
  readonly ns: string;
  /** Attribute idents that define membership in `ns` (for bare scope). */
  readonly nsIdents: readonly string[];
  readonly where: readonly Predicate[];
  readonly shape: Shape | undefined;
  readonly orderBy: readonly OrderBy[];
  readonly limit: number | undefined;
  readonly offset: number | undefined;
}

/**
 * A navigational query value. Phantom `R` is the row element type inferred
 * from `.select`.
 */
export interface NavQuery<R = unknown> {
  readonly _tag: "NavQuery";
  readonly spec: NavQuerySpec;
  readonly _result?: R;
}

export const isNavQuery = (x: unknown): x is NavQuery =>
  typeof x === "object" &&
  x !== null &&
  (x as { _tag?: unknown })._tag === "NavQuery";

// ── path / predicate helpers (stamped onto attrs by Namespace) ─────────────

export type PathCarrier = {
  readonly ident: string;
  readonly __path?: readonly string[];
};

export const pathOf = (attr: PathCarrier): readonly string[] =>
  attr.__path ?? [attr.ident];

const pred = (
  op: PredTag,
  attr: PathCarrier,
  value?: unknown,
): Predicate => ({
  _tag: "Predicate",
  op,
  path: pathOf(attr),
  value,
});

/** Predicate / shape methods attached to every stamped attr. */
export type AttrNav<A extends PathCarrier> = A & {
  readonly eq: (value: unknown) => Predicate;
  readonly ne: (value: unknown) => Predicate;
  readonly lt: (value: unknown) => Predicate;
  readonly lte: (value: unknown) => Predicate;
  readonly gt: (value: unknown) => Predicate;
  readonly gte: (value: unknown) => Predicate;
  readonly startsWith: (prefix: string) => Predicate;
  readonly includes: (needle: string) => Predicate;
  readonly exists: () => Predicate;
  readonly missing: () => Predicate;
  readonly optional: ReturnType<typeof optional<A>>;
  readonly select: A extends { readonly valueType: ":db.type/ref" }
    ? <const S extends Shape>(shape: S) => SelectNested<A, S>
    : never;
};

export interface SelectNested<A = unknown, S = unknown> {
  readonly _tag: "select";
  readonly attr: A;
  readonly shape: S;
  readonly optional: {
    readonly _tag: "optional";
    readonly field: SelectNested<A, S>;
  };
}

const NAV_METHODS = new Set([
  "eq",
  "ne",
  "lt",
  "lte",
  "gt",
  "gte",
  "startsWith",
  "includes",
  "exists",
  "missing",
  "optional",
  "select",
]);

export const attachAttrNav = <A extends PathCarrier>(attr: A): AttrNav<A> => {
  const api = {
    eq(this: PathCarrier, value: unknown) {
      return pred("eq", this, value);
    },
    ne(this: PathCarrier, value: unknown) {
      return pred("ne", this, value);
    },
    lt(this: PathCarrier, value: unknown) {
      return pred("lt", this, value);
    },
    lte(this: PathCarrier, value: unknown) {
      return pred("lte", this, value);
    },
    gt(this: PathCarrier, value: unknown) {
      return pred("gt", this, value);
    },
    gte(this: PathCarrier, value: unknown) {
      return pred("gte", this, value);
    },
    startsWith(this: PathCarrier, prefix: string) {
      return pred("startsWith", this, prefix);
    },
    includes(this: PathCarrier, needle: string) {
      return pred("includes", this, needle);
    },
    exists(this: PathCarrier) {
      return pred("exists", this);
    },
    missing(this: PathCarrier) {
      return pred("missing", this);
    },
    get optional() {
      return optional(attr);
    },
    select(this: PathCarrier, shape: Shape) {
      const nestedSelect: SelectNested<PathCarrier, Shape> = {
        _tag: "select",
        attr: this,
        shape,
        get optional() {
          return { _tag: "optional" as const, field: nestedSelect };
        },
      };
      return nestedSelect;
    },
  };

  return new Proxy(attr, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && prop in api) {
        const v = (api as Record<string, unknown>)[prop];
        return typeof v === "function" ? (v as Function).bind(receiver) : v;
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as AttrNav<A>;
};

export const withPath = <A extends PathCarrier>(
  attr: A,
  path: readonly string[],
): A => {
  if (attr.__path === path) return attr;
  return new Proxy(attr, {
    get(target, prop, receiver) {
      if (prop === "__path") return path;
      const v = Reflect.get(target, prop, receiver);
      if (
        typeof prop === "string" &&
        NAV_METHODS.has(prop) &&
        typeof v === "function"
      ) {
        return (v as Function).bind(receiver);
      }
      return v;
    },
  }) as A;
};

export const isSelectNested = (x: unknown): x is SelectNested =>
  typeof x === "object" &&
  x !== null &&
  (x as { _tag?: unknown })._tag === "select";

/** Convert a navigational shape into the literate pull map `lowerPullPattern` knows. */
export const shapeToPullMap = (shape: Shape): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(shape)) {
    out[key] = shapeFieldToPull(field);
  }
  return out;
};

const shapeFieldToPull = (field: unknown): unknown => {
  if (isPullOptional(field)) {
    return optional(shapeFieldToPull(field.field));
  }
  if (isSelectNested(field)) {
    return nested(
      field.attr as { readonly valueType: ":db.type/ref" },
      shapeToPullMap(field.shape as Shape),
    );
  }
  if (isPullNested(field)) {
    return field;
  }
  return field;
};

// ── builder ────────────────────────────────────────────────────────────────

export type SelectResult<S> = {
  readonly [K in keyof S]: SelectFieldResult<S[K]>;
};

type SchemaType<S> = S extends { readonly Type: infer T }
  ? T
  : S extends { readonly schema: { readonly Type: infer T } }
    ? T
    : never;

type SelectFieldResult<F> = F extends {
  readonly _tag: "optional";
  readonly field: infer Inner;
}
  ? SelectFieldResult<Inner> | undefined
  : F extends {
        readonly _tag: "select";
        readonly attr: infer A;
        readonly shape: infer S;
      }
    ? A extends { readonly cardinality: "many" }
      ? readonly SelectResult<S & object>[]
      : SelectResult<S & object>
    : F extends {
          readonly _tag: "nested";
          readonly attr: infer A;
          readonly pattern: infer P;
        }
      ? A extends { readonly cardinality: "many" }
        ? readonly SelectResult<P & object>[]
        : SelectResult<P & object>
      : F extends {
            readonly schema: infer S;
            readonly cardinality: infer Card;
          }
        ? F extends { readonly ident: ":db/id" }
          ? number
          : Card extends "many"
            ? readonly SchemaType<F>[]
            : SchemaType<F>
        : F extends { readonly ident: ":db/id" }
          ? number
          : never;

export interface NavQueryBuilder<N extends AnyNamespace, R = unknown> {
  readonly ns: N;
  readonly spec: NavQuerySpec;

  where(...preds: Predicate[]): NavQueryBuilder<N, R>;
  select<const S extends Shape>(
    shape: S,
  ): NavQueryBuilder<N, readonly SelectResult<S>[]>;
  orderBy(
    attr: PathCarrier,
    dir?: OrderDir,
    opts?: { readonly empty?: OrderEmpty },
  ): NavQueryBuilder<N, R>;
  limit(n: number): NavQueryBuilder<N, R>;
  offset(n: number): NavQueryBuilder<N, R>;

  /** Freeze into a runnable query value. */
  build(): NavQuery<R>;
}

const freeze = <R>(spec: NavQuerySpec): NavQuery<R> => ({
  _tag: "NavQuery",
  spec,
});

const builder = <N extends AnyNamespace, R>(
  ns: N,
  spec: NavQuerySpec,
): NavQueryBuilder<N, R> => {
  const self: NavQueryBuilder<N, R> = {
    ns,
    spec,
    where: (...preds) =>
      builder(ns, { ...spec, where: [...spec.where, ...preds] }),
    select: (shape) =>
      builder(ns, { ...spec, shape }) as unknown as NavQueryBuilder<
        N,
        readonly SelectResult<typeof shape>[]
      >,
    orderBy: (attr, dir = "asc", opts) =>
      builder(ns, {
        ...spec,
        orderBy: [
          ...spec.orderBy,
          {
            path: pathOf(attr),
            dir,
            empty: opts?.empty ?? "last",
          },
        ],
      }),
    limit: (n) => builder(ns, { ...spec, limit: n }),
    offset: (n) => builder(ns, { ...spec, offset: n }),
    build: () => freeze<R>(spec),
  };
  return self;
};

/**
 * Start a navigational query scoped to namespace `N`.
 *
 * Calling `.where` / `.select` / … returns a builder; pass the builder (or
 * `.build()`) to `db.q` / `db.live`. Builders are accepted directly so
 * `db.q(Ripple.query(Todo).where(...).select(...))` works without `.build()`.
 */
export const query = <N extends AnyNamespace>(ns: N): NavQueryBuilder<N> => {
  const nsIdents = Object.values(ns.attributes).map(
    (a) => (a as { ident: string }).ident,
  );
  return builder(ns, {
    ns: ns.ns,
    nsIdents,
    where: [],
    shape: undefined,
    orderBy: [],
    limit: undefined,
    offset: undefined,
  });
};

/** Accept a builder or a frozen {@link NavQuery}. */
export const asNavQuery = <R>(
  q: NavQuery<R> | NavQueryBuilder<AnyNamespace, R>,
): NavQuery<R> =>
  isNavQuery(q) ? q : (q as NavQueryBuilder<AnyNamespace, R>).build();

// ── lower to peer query object ─────────────────────────────────────────────

let fresh = 0;
const gensym = (prefix: string) => `?${prefix}${fresh++}`;

const resetGensym = () => {
  fresh = 0;
};

/** Lower predicates + optional namespace scope into where clauses + find pull. */
export const lowerNavQuery = (
  q: NavQuery,
): {
  readonly query: {
    readonly find: unknown[];
    readonly where: unknown[];
  };
  readonly pullMap: Record<string, unknown> | undefined;
} => {
  resetGensym();
  const root = "?e";
  const where: unknown[] = [];

  // Namespace scope: entity has at least one attr in the ns (or-join).
  if (q.spec.nsIdents.length > 0) {
    where.push([
      "or",
      ...q.spec.nsIdents.map((ident) => [root, ident, "_"]),
    ]);
  }

  for (const p of q.spec.where) {
    where.push(...lowerPredicate(root, p));
  }

  const pullMap =
    q.spec.shape !== undefined ? shapeToPullMap(q.spec.shape) : undefined;
  const find =
    pullMap !== undefined
      ? [["pull", root, lowerPullPattern(pullMap)]]
      : [root];

  return { query: { find, where }, pullMap };
};

const lowerPredicate = (root: string, p: Predicate): unknown[] => {
  const { path, op, value } = p;
  if (path.length === 0) return [];

  const clauses: unknown[] = [];
  let e = root;
  for (let i = 0; i < path.length - 1; i++) {
    const next = gensym("j");
    clauses.push([e, path[i], next]);
    e = next;
  }
  const attr = path[path.length - 1]!;

  switch (op) {
    case "eq":
      clauses.push([e, attr, value]);
      break;
    case "ne": {
      const v = gensym("v");
      clauses.push([e, attr, v], [["not=", v, value]]);
      break;
    }
    case "lt":
    case "lte":
    case "gt":
    case "gte": {
      const v = gensym("v");
      const fn =
        op === "lt"
          ? "<"
          : op === "lte"
            ? "<="
            : op === "gt"
              ? ">"
              : ">=";
      clauses.push([e, attr, v], [[fn, v, value]]);
      break;
    }
    case "startsWith": {
      const v = gensym("v");
      clauses.push([e, attr, v], [["starts-with?", v, value]]);
      break;
    }
    case "includes": {
      const v = gensym("v");
      clauses.push([e, attr, v], [["includes?", v, value]]);
      break;
    }
    case "exists":
      clauses.push([e, attr, "_"]);
      break;
    case "missing":
      clauses.push(["not", [e, attr, "_"]]);
      break;
  }
  return clauses;
};

/**
 * Apply interim client-side order/limit/offset and reshape pull rows.
 * Returns `readonly R[]` (pull maps) or `readonly number[]` (bare eids).
 */
export const finalizeNavResult = (
  q: NavQuery,
  raw: unknown,
  pullMap: Record<string, unknown> | undefined,
): unknown => {
  let rows: unknown[] = Array.isArray(raw) ? [...raw] : [];

  // find-pull → [[map] | [null], ...] or pull scalar forms; normalize to maps/eids
  if (pullMap !== undefined) {
    rows = rows
      .map((row) => {
        const cell = Array.isArray(row) ? row[0] : row;
        if (cell === null || cell === undefined) return null;
        return reshapePullResult(pullMap, cell);
      })
      .filter((x) => x !== null);
  } else {
    rows = rows.map((row) => (Array.isArray(row) ? row[0] : row));
  }

  if (q.spec.orderBy.length > 0 && pullMap !== undefined) {
    rows = sortRows(rows, q.spec.orderBy, pullMap);
  }

  const offset = q.spec.offset ?? 0;
  if (offset > 0) rows = rows.slice(offset);
  if (q.spec.limit !== undefined) rows = rows.slice(0, q.spec.limit);

  return rows;
};

const sortRows = (
  rows: unknown[],
  orders: readonly OrderBy[],
  pullMap: Record<string, unknown>,
): unknown[] => {
  const keys = orders.map((o) => keyForOrder(o, pullMap));
  return [...rows].sort((a, b) => {
    for (let i = 0; i < orders.length; i++) {
      const ord = orders[i]!;
      const key = keys[i];
      const av = key === undefined ? undefined : (a as Record<string, unknown>)[key];
      const bv = key === undefined ? undefined : (b as Record<string, unknown>)[key];
      const aMiss = av === undefined || av === null;
      const bMiss = bv === undefined || bv === null;
      if (aMiss || bMiss) {
        if (aMiss && bMiss) continue;
        if (ord.empty === "last") return aMiss ? 1 : -1;
        return aMiss ? -1 : 1;
      }
      const cmp = compare(av, bv);
      if (cmp !== 0) return ord.dir === "asc" ? cmp : -cmp;
    }
    return 0;
  });
};

/** Match an order path to a select key when possible. */
const keyForOrder = (
  order: OrderBy,
  pullMap: Record<string, unknown>,
): string | undefined => {
  for (const [key, field] of Object.entries(pullMap)) {
    const info = inspectPullField(field);
    const ident = lowerAttr(info.attr);
    if (order.path.length === 1 && ident === order.path[0]) return key;
  }
  return undefined;
};

const compare = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return String(a).localeCompare(String(b));
};
