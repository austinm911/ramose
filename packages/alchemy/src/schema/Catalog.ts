/**
 * A catalog is the composition of namespaces. It is the type parameter the
 * typed database client is generic over.
 */

import type { AnyNamespace, Namespace } from "./Namespace.ts";

export type NamespaceMap = Record<string, AnyNamespace>;

export interface Catalog<Ns extends NamespaceMap = NamespaceMap> {
  readonly _tag: "Catalog";
  readonly namespaces: Ns;
}

export type AnyCatalog = Catalog<NamespaceMap>;

/**
 * Compose namespaces into a catalog.
 *
 * ```ts
 * const Movies = Catalog({
 *   user: Namespace("user", { name: attr(Schema.String) }),
 *   movie: Namespace("movie", { title: attr(Schema.String) }),
 * })
 * ```
 *
 * The transact builder addresses attrs via `User.name` (the stamped
 * attr ref). The catalog key is only the composition key; `ns` is the
 * ident prefix.
 */
export const Catalog = <const Ns extends NamespaceMap>(
  namespaces: Ns,
): Catalog<Ns> => ({
  _tag: "Catalog",
  namespaces,
});

/** Concatenate catalogs. Later keys win on collision. */
export const merge = <const A extends NamespaceMap, const B extends NamespaceMap>(
  left: Catalog<A>,
  right: Catalog<B>,
): Catalog<A & B> => ({
  _tag: "Catalog",
  namespaces: { ...left.namespaces, ...right.namespaces },
});

export type NamespaceOf<
  C extends AnyCatalog,
  K extends keyof C["namespaces"],
> = C["namespaces"][K];

