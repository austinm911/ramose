/**
 * Typed read results. `entity` and `pull` project catalog value types so
 * a known attribute does not collapse to `unknown`.
 */

import type { AnyCatalog } from "./Catalog.ts";
import type { CatalogIdent, ReadAtIdent } from "./idents.ts";

export type EntityMap<C extends AnyCatalog> = {
  readonly ":db/id": number;
} & {
  readonly [I in CatalogIdent<C>]?: ReadAtIdent<C, I>;
};

export type PullPattern<C extends AnyCatalog> = readonly (
  | CatalogIdent<C>
  | "*"
)[];

export type PullResult<
  C extends AnyCatalog,
  P extends PullPattern<C>,
> = "*" extends P[number]
  ? EntityMap<C>
  : {
      readonly ":db/id"?: number;
    } & {
      readonly [I in P[number] & CatalogIdent<C>]?: ReadAtIdent<C, I>;
    };
