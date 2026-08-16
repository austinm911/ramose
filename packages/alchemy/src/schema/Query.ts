/** Catalog-generic datalog builder. Bindings accumulate; `find` is the typed terminal. */

import type { RuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import type { QueryOptions, QueryResponse } from "../Client.ts";
import type { DatabaseError } from "../DatabaseTypes.ts";
import { lowerAttr } from "./attrRef.ts";
import type { AnyCatalog } from "./Catalog.ts";
import type { Eid } from "./Eid.ts";
import { noPeer, type MissingPeer } from "./Errors.ts";
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
> = Bind<
  Bind<Bind<B, E, Eid<C>>, A, string>,
  V,
  BindValue<C, A>
>;

export type FindRow<
  B extends object,
  Vars extends readonly QueryVar[],
> = Vars extends readonly [infer H, ...infer Rest]
  ? [
      H extends keyof B ? B[H] : unknown,
      ...FindRow<
        B,
        Rest extends readonly QueryVar[] ? Rest : readonly []
      >,
    ]
  : [];

/** `readonly [Eid<C>, string][]` — a readonly array of mutable row tuples. */
export type FindRows<
  B extends object,
  Vars extends readonly QueryVar[],
> = ReadonlyArray<FindRow<B, Vars>>;

export interface QuerySpec {
  readonly find: readonly string[];
  readonly where: readonly (readonly [unknown, unknown, unknown])[];
  readonly options?: QueryOptions | undefined;
  /** Vars bound as an entity or `:db.type/ref` — wrapped as {@link Eid} on find. */
  readonly eidVars?: readonly string[] | undefined;
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

/** I/O for `find` / `query`. The client supplies this; fixtures omit it. */
export interface QueryIo {
  find(
    spec: QuerySpec,
    vars: readonly QueryVar[],
  ): Effect.Effect<unknown, DatabaseError, RuntimeContext>;
  query(
    spec: QuerySpec,
    vars: readonly QueryVar[],
  ): Effect.Effect<QueryResponse<unknown>, DatabaseError, RuntimeContext>;
}

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

  /** Read fence / explain. Does not change bindings. */
  options(opts: QueryOptions): QueryBuilder<C, B>;

  /**
   * Select variables. The row is a tuple of their bound types.
   * `find("?e", "?n")` → `readonly [Eid<C>, string][]` after `?e`
   * was bound in the entity slot and `?n` against `:user/name`.
   */
  find<const Vars extends readonly QueryVar[]>(
    ...vars: Vars
  ): Effect.Effect<FindRows<B, Vars>, DatabaseError | MissingPeer, RuntimeContext>;

  /** Same as {@link find} but keeps `t` / `root` / `explain` / meta. */
  query<const Vars extends readonly QueryVar[]>(
    ...vars: Vars
  ): Effect.Effect<
    QueryResponse<FindRows<B, Vars>>,
    DatabaseError | MissingPeer,
    RuntimeContext
  >;
}

const makeBuilder = <C extends AnyCatalog, B extends object>(
  catalog: C,
  spec: QuerySpec,
  io?: QueryIo,
): QueryBuilder<C, B> => ({
  catalog,
  spec,
  where: (e: EntitySlot, a: unknown, v: unknown) => {
    const eidVars = new Set(spec.eidVars ?? []);
    if (isQueryVar(e)) eidVars.add(e);
    if (isQueryVar(v) && isRefAttr(catalog, a)) eidVars.add(v);
    return makeBuilder(
      catalog,
      {
        find: spec.find,
        where: [...spec.where, [e, lowerAttr(a), v] as const],
        options: spec.options,
        eidVars: [...eidVars],
      },
      io,
    );
  },
  options: (opts: QueryOptions) =>
    makeBuilder(
      catalog,
      { ...spec, options: { ...spec.options, ...opts } },
      io,
    ),
  find: (...vars: readonly QueryVar[]) =>
    io
      ? (io.find({ ...spec, find: vars }, vars) as ReturnType<
          QueryBuilder<C, B>["find"]
        >)
      : noPeer("q"),
  query: (...vars: readonly QueryVar[]) =>
    io
      ? (io.query({ ...spec, find: vars }, vars) as ReturnType<
          QueryBuilder<C, B>["query"]
        >)
      : noPeer("query"),
}) as unknown as QueryBuilder<C, B>;

/**
 * Start a catalog-typed query builder. Used by `db.q()` / `db.q(q => …)`.
 */
export const queryBuilder = <C extends AnyCatalog>(
  catalog: C,
  io?: QueryIo,
): QueryBuilder<C, {}> =>
  makeBuilder(catalog, { find: [], where: [], options: undefined }, io);
