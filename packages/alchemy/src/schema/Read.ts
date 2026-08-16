/**
 * Typed read results. `db.entity` is gone — it was the leftover
 * ident-keyed bag. Pull lives on the {@link Eid} wrapper from `q`
 * (`./Eid.ts` / `./Pull.ts`): a plain object of attr refs, not ident keys.
 *
 * {@link EntityMap} is the ident-keyed bag *shape* (keyword-soup), not
 * a client method.
 */

import type { AnyCatalog } from "./Catalog.ts";
import type { CatalogIdent, ReadAtIdent } from "./idents.ts";

export type EntityMap<C extends AnyCatalog> = {
  readonly ":db/id": number;
} & {
  readonly [I in CatalogIdent<C>]?: ReadAtIdent<C, I>;
};
