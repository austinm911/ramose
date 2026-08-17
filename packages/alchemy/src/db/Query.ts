/**
 * The catalog-generic datalog builder.
 *
 * `where` accumulates bindings; `find` and `explain` are the terminals, and
 * both produce a {@link Query} — a *value*, not an Effect. Which of the two
 * terminals on `Db` runs it is the caller's choice: `db.q(build)` runs it once,
 * `db.live(build)` stands it up. One builder, two terminals, no `db.query`.
 */

import { lowerAttr } from "./attrRef.ts";
import type { AnyCatalog } from "./Catalog.ts";
import type { Eid } from "./Eid.ts";
import type { Pull, ValidatePull } from "./Pull.ts";
import type { AttrAtIdent, CatalogIdent, ValueAtIdent } from "./idents.ts";

export type QueryVar = `?${string}`;
export type QueryBlank = "_";

/** Entity slot: var, blank, eid, or tempid/ident string. */
export type EntitySlot = QueryVar | QueryBlank | number | string;

/**
 * An attr ref is anything that carries a catalog ident — the stamped
 * attributes on a namespace (`User.name`) are the intended form.
 */
export type AttrRef<C extends AnyCatalog> = {
  readonly ident: CatalogIdent<C>;
};

/**
 * Attribute slot. Catalog attrs and idents are preferred; variables and
 * `_` are legal (a var here is an ident, not a value).
 */
export type AttrSlot<C extends AnyCatalog> =
  | CatalogIdent<C>
  | AttrRef<C>
  | QueryVar
  | QueryBlank;

type IdentOfSlot<C extends AnyCatalog, A> = A extends {
  readonly ident: infer I extends string;
}
  ? I
  : A extends CatalogIdent<C>
    ? A
    : never;

/** Value type when the attr slot names a known catalog ident; else `unknown`. */
export type ValueFromAttr<C extends AnyCatalog, A> =
  IdentOfSlot<C, A> extends infer I
    ? [I] extends [never]
      ? unknown
      : I extends string
        ? ValueAtIdent<C, I>
        : unknown
    : unknown;

/**
 * Value slot. A var is always legal (and becomes typed when the attr is
 * known). A constant must match the attr's value type.
 */
export type ValueSlot<C extends AnyCatalog, A> =
  | QueryVar
  | QueryBlank
  | ValueFromAttr<C, A>;

type Bind<B extends object, Name, T> = Name extends QueryVar
  ? Name extends keyof B
    ? B
    : {
        readonly [K in keyof B | Name]: K extends Name
          ? T
          : K extends keyof B
            ? B[K]
            : never;
      }
  : B;

/**
 * Value-slot binding: a `:db.type/ref` attr yields {@link Eid};
 * otherwise the attr's value type (or `unknown` if the attr is a
 * var / `_`).
 */
export type BindValue<C extends AnyCatalog, A> =
  ValueTypeOfSlot<C, A> extends ":db.type/ref"
    ? Eid<C>
    : ValueFromAttr<C, A>;

type ValueTypeOfSlot<C extends AnyCatalog, A> = [A] extends [
  { readonly valueType: infer VT },
]
  ? VT
  : IdentOfSlot<C, A> extends infer I
    ? [I] extends [never]
      ? undefined
      : I extends string
        ? AttrAtIdent<C, I>["valueType"]
        : undefined
    : undefined;

/**
 * Bind entity vars as {@link Eid}, attr vars as idents (`string`),
 * and value vars as {@link BindValue} when the attr is known.
 */
export type BindClause<
  C extends AnyCatalog,
  B extends object,
  E,
  A,
  V,
> = Bind<Bind<Bind<B, E, Eid<C>>, A, string>, V, BindValue<C, A>>;

export type FindRow<
  B extends object,
  Vars extends readonly QueryVar[],
> = Vars extends readonly [infer H, ...infer Rest]
  ? [
      H extends keyof B ? B[H] : unknown,
      ...FindRow<B, Rest extends readonly QueryVar[] ? Rest : readonly []>,
    ]
  : [];

/** `readonly [Eid<C>, string][]` — a readonly array of mutable row tuples. */
export type FindRows<
  B extends object,
  Vars extends readonly QueryVar[],
> = ReadonlyArray<FindRow<B, Vars>>;

/** One row of a pulled query: the entity, and the pattern's result for it. */
export type PullRow<C extends AnyCatalog, P> = readonly [Eid<C>, Pull<C, P>];

/** What `.explain(...)` yields: the rows, plus the planner's own account. */
export interface Explained<R> {
  readonly rows: R;
  /** One entry per clause, in plan order. */
  readonly explain: readonly unknown[];
  /** Peak intermediate-relation size against the budget, when the peer reports it. */
  readonly budget?: unknown;
}

export interface QuerySpec {
  readonly find: readonly string[];
  readonly where: readonly (readonly [unknown, unknown, unknown])[];
  /** Vars bound as an entity or `:db.type/ref` — wrapped as {@link Eid} on find. */
  readonly eidVars?: readonly string[] | undefined;
  /** `.explain(...)` rather than `.find(...)`. */
  readonly explain?: boolean | undefined;
  /** The literate pattern `.pull(...)` attached, if any. */
  readonly pull?: unknown;
}

/**
 * A built query. `db.q` runs it once, `db.live` stands it up; both take the
 * builder callback that produces it, so neither terminal is on the builder.
 */
export interface Query<C extends AnyCatalog = AnyCatalog, R = unknown> {
  readonly catalog: C;
  readonly spec: QuerySpec;
  readonly vars: readonly QueryVar[];
  /** Phantom: the row type the selected vars yield. Never present at runtime. */
  readonly _result?: R;
}

/** The one var a `.pull` may hang off: a single `find` var bound as an entity. */
type SoleEidVar<
  C extends AnyCatalog,
  B extends object,
  Vars extends readonly QueryVar[],
> = Vars extends readonly [infer V extends QueryVar]
  ? V extends keyof B
    ? [B[V]] extends [Eid<C>]
      ? V
      : never
    : never
  : never;

/**
 * A `find` terminal. It *is* a {@link Query}; `.pull(pattern)` narrows it to
 * one row per entity — `readonly [Eid<C>, Pull<C, P>]` — and is only callable
 * when exactly one var was selected and it was bound as an entity.
 */
export interface FindQuery<
  C extends AnyCatalog,
  B extends object,
  Vars extends readonly QueryVar[],
> extends Query<C, FindRows<B, Vars>> {
  pull<const P>(
    pattern: [SoleEidVar<C, B, Vars>] extends [never]
      ? never
      : P & ValidatePull<C, P>,
  ): Query<C, ReadonlyArray<PullRow<C, P>>>;
}

const isQueryVar = (x: unknown): x is QueryVar =>
  typeof x === "string" && x.startsWith("?") && x.length > 1;

const isRefAttr = (catalog: AnyCatalog, a: unknown): boolean => {
  if (typeof a === "object" && a !== null && "valueType" in a) {
    return (a as { valueType: unknown }).valueType === ":db.type/ref";
  }
  if (typeof a === "string" && a.startsWith(":")) {
    for (const ns of Object.values(catalog.namespaces)) {
      for (const attr of Object.values(ns.attributes)) {
        if (attr.ident === a) return attr.valueType === ":db.type/ref";
      }
    }
  }
  return false;
};

/** Lower a builder spec to the JS query object the peer already accepts. */
export const toQueryObject = (
  spec: QuerySpec,
  vars: readonly string[],
): { find: string[]; where: unknown[][] } => ({
  find: [...vars],
  where: spec.where.map((clause) => [...clause]),
});

export interface QueryBuilder<
  C extends AnyCatalog = AnyCatalog,
  B extends object = {},
> {
  readonly catalog: C;
  readonly spec: QuerySpec;

  /**
   * Add one EAV clause. Bindings accumulate: a value-slot var against a
   * known attr inherits that attr's type (an {@link Eid} when the attr
   * is a ref).
   */
  where<
    const E extends EntitySlot,
    const A extends AttrSlot<C>,
    const V extends ValueSlot<C, A>,
  >(
    e: E,
    a: A,
    v: V,
  ): QueryBuilder<C, BindClause<C, B, E, A, V>>;

  /**
   * Select variables. The row is a tuple of their bound types.
   * `find("?e", "?n")` → `readonly [Eid<C>, string][]` after `?e`
   * was bound in the entity slot and `?n` against `:user/name`.
   */
  find<const Vars extends readonly QueryVar[]>(
    ...vars: Vars
  ): FindQuery<C, B, Vars>;

  /** Same selection, plus the planner's clause-by-clause plan. */
  explain<const Vars extends readonly QueryVar[]>(
    ...vars: Vars
  ): Query<C, Explained<FindRows<B, Vars>>>;
}

const query = <C extends AnyCatalog>(
  catalog: C,
  spec: QuerySpec,
  vars: readonly QueryVar[],
): Query<C> => ({ catalog, spec, vars });

const findQuery = <C extends AnyCatalog>(
  catalog: C,
  spec: QuerySpec,
  vars: readonly QueryVar[],
): Query<C> & { pull: (pattern: unknown) => Query<C> } => ({
  ...query(catalog, spec, vars),
  pull: (pattern: unknown) =>
    query(catalog, { ...spec, pull: pattern }, vars),
});

const makeBuilder = <C extends AnyCatalog, B extends object>(
  catalog: C,
  spec: QuerySpec,
): QueryBuilder<C, B> =>
  ({
    catalog,
    spec,
    where: (e: EntitySlot, a: unknown, v: unknown) => {
      const eidVars = new Set(spec.eidVars ?? []);
      if (isQueryVar(e)) eidVars.add(e);
      if (isQueryVar(v) && isRefAttr(catalog, a)) eidVars.add(v);
      return makeBuilder(catalog, {
        ...spec,
        where: [...spec.where, [e, lowerAttr(a), v] as const],
        eidVars: [...eidVars],
      });
    },
    find: (...vars: readonly QueryVar[]) =>
      findQuery(catalog, { ...spec, find: vars }, vars),
    explain: (...vars: readonly QueryVar[]) =>
      query(catalog, { ...spec, find: vars, explain: true }, vars),
  }) as unknown as QueryBuilder<C, B>;

/** @internal Start a catalog-typed query builder. `db.q` / `db.live` hand one out. */
export const queryBuilder = <C extends AnyCatalog>(
  catalog: C,
): QueryBuilder<C, {}> =>
  makeBuilder(catalog, { find: [], where: [] });
