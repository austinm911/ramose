/** Catalog-generic transaction builder. `transact(function* (tx) { … })` is the happy path. */

import * as Effect from "effect/Effect";
import type { AnyAttribute, ValueOf } from "./Attribute.ts";
import type { AnyCatalog } from "./Catalog.ts";
import type {
  CatalogIdent,
  EntityRef,
  ValueAtIdent,
  WriteAtIdent,
} from "./idents.ts";

// ── attr / value correlation ───────────────────────────────────────────────

/**
 * Attribute slot on the builder. An attr ref (`User.name`) or a catalog
 * ident (`":user/name"`). Unknown idents are not in the union.
 */
export type TxAttr<C extends AnyCatalog> =
  | { readonly ident: CatalogIdent<C> }
  | CatalogIdent<C>;

type IdentOfTxAttr<C extends AnyCatalog, A> = A extends {
  readonly ident: infer I extends string;
}
  ? I
  : A extends CatalogIdent<C>
    ? A
    : never;

/** Value type correlated to a {@link TxAttr}. `never` when the attr is unknown. */
export type TxValue<C extends AnyCatalog, A> =
  IdentOfTxAttr<C, A> extends infer I
    ? [I] extends [never]
      ? never
      : I extends string
        ? ValueAtIdent<C, I>
        : never
    : never;

/** Lookup ref written with an attr ref: `[User.name, "Ada"]`. */
export type AttrRefLookup<C extends AnyCatalog> = {
  [I in CatalogIdent<C>]: readonly [
    { readonly ident: I },
    ValueAtIdent<C, I>,
  ];
}[CatalogIdent<C>];

export type TxEntity<C extends AnyCatalog> =
  | EntityRef<C>
  | EntityHandle<C>
  | AttrRefLookup<C>;

// ── collected ops (what a future impl would send) ──────────────────────────

export type TxOp =
  | readonly [":db/add", unknown, string, unknown]
  | readonly [":db/retract", unknown, string]
  | readonly [":db/retract", unknown, string, unknown]
  | readonly [":db/retractEntity", unknown];

export interface TxSpec {
  readonly ops: readonly TxOp[];
}

// ── entity handle (a bag) ──────────────────────────────────────────────────

/**
 * A tempid / eid / lookup handle. `add` / `retract` take an attr from
 * *any* catalog namespace — that is the bag.
 */
export interface EntityHandle<C extends AnyCatalog = AnyCatalog> {
  readonly _tag: "EntityHandle";
  readonly id: EntityRef<C>;

  add<const A extends TxAttr<C>>(
    attr: A,
    value: TxValue<C, A>,
  ): Effect.Effect<void>;

  retract<const A extends TxAttr<C>>(
    attr: A,
    value?: TxValue<C, A>,
  ): Effect.Effect<void>;

  retractEntity(): Effect.Effect<void>;
}

// ── builder ────────────────────────────────────────────────────────────────

/**
 * Catalog-generic transaction builder. Methods are Effects so the body
 * is a generator (or an Effect.gen callback). `db.transact` is the
 * terminal that would submit.
 */
export interface TxBuilder<C extends AnyCatalog = AnyCatalog> {
  readonly catalog: C;
  readonly spec: TxSpec;

  /**
   * Allocate a tempid, or wrap an existing eid / tempid / lookup ref.
   * `tx.entity()` → new handle; `tx.entity(1001)`; `tx.entity("ada")`;
   * `tx.entity([User.name, "Ada"])`.
   */
  entity(): Effect.Effect<EntityHandle<C>>;
  entity(id: TxEntity<C>): Effect.Effect<EntityHandle<C>>;

  /** Assert one datom. Cardinality-many is one call per value. */
  add<const A extends TxAttr<C>>(
    e: TxEntity<C>,
    attr: A,
    value: TxValue<C, A>,
  ): Effect.Effect<void>;

  retract<const A extends TxAttr<C>>(
    e: TxEntity<C>,
    attr: A,
    value?: TxValue<C, A>,
  ): Effect.Effect<void>;

  retractEntity(e: TxEntity<C>): Effect.Effect<void>;
}

/**
 * Error / context extracted from a generator body's yielded Effects.
 * Same inference `Effect.gen` uses.
 */
export type YieldError<Eff> = [Eff] extends [never]
  ? never
  : [Eff] extends [Effect.Effect<infer _A, infer E, infer _R>]
    ? E
    : never;

export type YieldContext<Eff> = [Eff] extends [never]
  ? never
  : [Eff] extends [Effect.Effect<infer _A, infer _E, infer R>]
    ? R
    : never;

/**
 * Generator body — the happy path:
 * `db.transact(function* (tx) { … })`.
 */
export type TxGenBody<
  C extends AnyCatalog,
  Eff extends Effect.Effect<any, any, any> = Effect.Effect<any, any, any>,
  A = unknown,
> = (tx: TxBuilder<C>) => Generator<Eff, A, never>;

/**
 * Effect-returning callback — kept for composition
 * (`(tx) => Effect.gen(...)` / `Effect.fn`). Not the default.
 */
export type TxEffectBody<
  C extends AnyCatalog,
  E = never,
  R = never,
> = (tx: TxBuilder<C>) => Effect.Effect<unknown, E, R>;

const isAttrRef = (a: unknown): a is { readonly ident: string } =>
  typeof a === "object" &&
  a !== null &&
  "ident" in a &&
  typeof (a as { ident: unknown }).ident === "string";

const isHandle = (e: unknown): e is EntityHandle =>
  typeof e === "object" &&
  e !== null &&
  (e as { _tag?: unknown })._tag === "EntityHandle";

const lowerAttr = (a: unknown): string =>
  isAttrRef(a) ? a.ident : (a as string);

const resolveEntity = (e: unknown): unknown => {
  if (isHandle(e)) return e.id;
  if (Array.isArray(e) && e.length === 2 && isAttrRef(e[0])) {
    return [e[0].ident, e[1]];
  }
  return e;
};

const makeHandle = <C extends AnyCatalog>(
  id: EntityRef<C>,
  ops: TxOp[],
): EntityHandle<C> => ({
  _tag: "EntityHandle",
  id,
  add: (attr: unknown, value: unknown) =>
    Effect.sync(() => {
      ops.push([":db/add", id, lowerAttr(attr), value]);
    }),
  retract: (attr: unknown, value?: unknown) =>
    Effect.sync(() => {
      if (value === undefined) {
        ops.push([":db/retract", id, lowerAttr(attr)]);
      } else {
        ops.push([":db/retract", id, lowerAttr(attr), value]);
      }
    }),
  retractEntity: () =>
    Effect.sync(() => {
      ops.push([":db/retractEntity", id]);
    }),
});

/**
 * Start a catalog-typed transaction builder. Used by
 * `db.transact(function* (tx) { … })` and by compile-time / runtime
 * fixtures.
 */
export const txBuilder = <C extends AnyCatalog>(catalog: C): TxBuilder<C> => {
  const ops: TxOp[] = [];
  let next = 0;
  const builder: TxBuilder<C> = {
    catalog,
    get spec() {
      return { ops: ops.slice() };
    },
    entity: ((id?: TxEntity<C>) =>
      Effect.sync(() => {
        const resolved =
          id === undefined
            ? (`tmp-${++next}` as EntityRef<C>)
            : (resolveEntity(id) as EntityRef<C>);
        return makeHandle(resolved, ops);
      })) as TxBuilder<C>["entity"],
    add: (e: unknown, attr: unknown, value: unknown) =>
      Effect.sync(() => {
        ops.push([":db/add", resolveEntity(e), lowerAttr(attr), value]);
      }),
    retract: (e: unknown, attr: unknown, value?: unknown) =>
      Effect.sync(() => {
        if (value === undefined) {
          ops.push([":db/retract", resolveEntity(e), lowerAttr(attr)]);
        } else {
          ops.push([":db/retract", resolveEntity(e), lowerAttr(attr), value]);
        }
      }),
    retractEntity: (e: unknown) =>
      Effect.sync(() => {
        ops.push([":db/retractEntity", resolveEntity(e)]);
      }),
  };
  return builder;
};

// ── secondary: nested maps / wire / list ops ───────────────────────────────

type NamespaceName<C extends AnyCatalog> = {
  [K in keyof C["namespaces"]]: C["namespaces"][K]["ns"];
}[keyof C["namespaces"]];

type NamespaceByName<C extends AnyCatalog, Name extends string> = {
  [K in keyof C["namespaces"]]: C["namespaces"][K]["ns"] extends Name
    ? C["namespaces"][K]
    : never;
}[keyof C["namespaces"]];

type AttrWrites<A extends AnyAttribute> = A["cardinality"] extends "many"
  ? ReadonlyArray<ValueOf<A>>
  : ValueOf<A>;

type NamespaceWrites<N extends { readonly attributes: Record<string, AnyAttribute> }> =
  {
    [A in keyof N["attributes"]]+?: AttrWrites<N["attributes"][A]>;
  };

/** Nested entity map — secondary form, not the happy path. */
export type NestedEntity<C extends AnyCatalog> = {
  readonly ":db/id"?: EntityRef<C>;
} & {
  [Name in NamespaceName<C>]+?: NamespaceWrites<NamespaceByName<C, Name>>;
};

/** Keyword-soup map the peer already speaks. `transactWire`. */
export type WireEntity<C extends AnyCatalog> = {
  readonly ":db/id"?: EntityRef<C>;
} & {
  [I in CatalogIdent<C>]+?: WriteAtIdent<C, I>;
};

export type AddOp<C extends AnyCatalog> = {
  [I in CatalogIdent<C>]: readonly [":db/add", EntityRef<C>, I, ValueAtIdent<C, I>];
}[CatalogIdent<C>];

export type RetractOp<C extends AnyCatalog> = {
  [I in CatalogIdent<C>]:
    | readonly [":db/retract", EntityRef<C>, I, ValueAtIdent<C, I>]
    | readonly [":db/retract", EntityRef<C>, I];
}[CatalogIdent<C>];

export type RetractEntityOp<C extends AnyCatalog> = readonly [
  ":db/retractEntity",
  EntityRef<C>,
];

export type TypedTxItem<C extends AnyCatalog> =
  | NestedEntity<C>
  | AddOp<C>
  | RetractOp<C>
  | RetractEntityOp<C>;

export type TypedTx<C extends AnyCatalog> = readonly TypedTxItem<C>[];

export type WireTxItem<C extends AnyCatalog> =
  | WireEntity<C>
  | AddOp<C>
  | RetractOp<C>
  | RetractEntityOp<C>;

export type WireTx<C extends AnyCatalog> = readonly WireTxItem<C>[];
