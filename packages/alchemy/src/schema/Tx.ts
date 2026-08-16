/**
 * Typed transaction forms.
 *
 * The primary surface is a *nested* map keyed by namespace name, then
 * attribute key — `{ user: { name: "Ada" } }`. That infers cleanly and
 * feels like `Schema.Struct`. The keyword-soup wire form
 * (`{ ":user/name": "Ada" }`) is `WireEntity` / `transactWire`, kept
 * because it is what the peer already accepts.
 *
 * List ops (`:db/add` / `:db/retract` / `:db/retractEntity`) stay, with
 * the attribute slot restricted to catalog idents and the value slot
 * correlated to that ident.
 */

import type { AnyAttribute, ValueOf } from "./Attribute.ts";
import type { AnyCatalog } from "./Catalog.ts";
import type {
  CatalogIdent,
  EntityRef,
  ValueAtIdent,
  WriteAtIdent,
} from "./idents.ts";

type NamespaceName<C extends AnyCatalog> = {
  [K in keyof C["namespaces"]]: C["namespaces"][K]["name"];
}[keyof C["namespaces"]];

type NamespaceByName<C extends AnyCatalog, Name extends string> = {
  [K in keyof C["namespaces"]]: C["namespaces"][K]["name"] extends Name
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

/**
 * Nested entity map. Keys are namespace *names* (`user`, not the catalog
 * key). Every attribute is optional — a tx does not have to set them all.
 */
export type NestedEntity<C extends AnyCatalog> = {
  readonly ":db/id"?: EntityRef<C>;
} & {
  [Name in NamespaceName<C>]+?: NamespaceWrites<NamespaceByName<C, Name>>;
};

/** Keyword-soup map the peer already speaks. */
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
