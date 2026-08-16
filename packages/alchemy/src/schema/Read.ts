/** Ident-keyed entity bag shape (keyword-soup). Pull lives on `Eid`. */

import type { AnyCatalog } from "./Catalog.ts";
import type { CatalogIdent, ReadAtIdent } from "./idents.ts";

export type EntityMap<C extends AnyCatalog> = {
  readonly ":db/id": number;
} & {
  readonly [I in CatalogIdent<C>]?: ReadAtIdent<C, I>;
};
