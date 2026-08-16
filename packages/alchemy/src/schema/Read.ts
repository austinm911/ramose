/**
 * Typed read results. `entity` projects the whole catalog bag so a
 * known attribute does not collapse to `unknown`. `pull` lives in
 * `./Pull.ts` — a plain object of attr refs, not ident keys.
 */

import type { AnyCatalog } from "./Catalog.ts";
import type { CatalogIdent, ReadAtIdent } from "./idents.ts";

export type EntityMap<C extends AnyCatalog> = {
  readonly ":db/id": number;
} & {
  readonly [I in CatalogIdent<C>]?: ReadAtIdent<C, I>;
};
