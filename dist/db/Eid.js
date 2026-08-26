/**
 * An entity id, as data.
 *
 * One shape: a branded number. Valid as a React key, a write subject, and a
 * `db.pull` subject with no cast. The brand is a phantom — the value stays
 * a plain number.
 *
 * `Eid<N>` over a **namespace** is the cell `select({ id: N.id })` yields.
 * A `User` id is not a `Todo` id, and a bare `number` is not a cell.
 *
 * `Eid<C>` over a **catalog** is the union of `Eid<N>` for every namespace
 * in `C` (same as {@link SchemaEid}). Transaction eids and
 * `principal().eid` use this.
 */
/** @internal Query rows and reports brand raw ids with this. */
export const makeEid = (id) => id;
//# sourceMappingURL=Eid.js.map