/**
 * Typed read results. `entity` and `pull` project catalog value types so
 * a known attribute does not collapse to `unknown`.
 *
 * `pull` speaks the same language as writes: attr refs (`User.name`) or
 * catalog idents (`":user/name"`). The engine still keys the map by
 * ident; the *call* accepts `User.name`.
 *
 * ```ts
 * const pulled = yield* db.pull(1001, [User.name, User.age])
 * // pulled?.[":user/name"] : string | undefined
 * // pulled?.[":user/age"]  : number | undefined
 * ```
 */

import type { AnyCatalog } from "./Catalog.ts";
import type { CatalogIdent, ReadAtIdent } from "./idents.ts";

export type EntityMap<C extends AnyCatalog> = {
  readonly ":db/id": number;
} & {
  readonly [I in CatalogIdent<C>]?: ReadAtIdent<C, I>;
};

/**
 * One slot in a pull pattern. Attr ref (`User.name`), catalog ident
 * (`":user/name"`), or wildcard.
 */
export type PullAttr<C extends AnyCatalog> =
  | CatalogIdent<C>
  | { readonly ident: CatalogIdent<C> }
  | "*";

export type PullPattern<C extends AnyCatalog> = readonly PullAttr<C>[];

type IdentOfPull<C extends AnyCatalog, A> = A extends "*"
  ? "*"
  : A extends { readonly ident: infer I extends string }
    ? I
    : A extends CatalogIdent<C>
      ? A
      : never;

/** Idents named by a pull pattern — attr refs lower to their `ident`. */
export type PullIdents<C extends AnyCatalog, P extends PullPattern<C>> =
  IdentOfPull<C, P[number]>;

export type PullResult<
  C extends AnyCatalog,
  P extends PullPattern<C>,
> = "*" extends PullIdents<C, P>
  ? EntityMap<C>
  : {
      readonly ":db/id"?: number;
    } & {
      readonly [I in PullIdents<C, P> & CatalogIdent<C>]?: ReadAtIdent<C, I>;
    };
