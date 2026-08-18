/**
 * @internal The reader half of the seam `Db.ts` attaches under
 * `Symbol.for("ripple.db.seam")` (see `DbSeam` in
 * `packages/alchemy/src/db/Db.ts` — the two shapes must stay compatible,
 * and `test/db-seam.test.ts` over there pins the contract).
 *
 * Why hooks need it: `db.asOf(t)` and `db.history` are pure and build a
 * *new* view object per call, so an inline `useQuery(db.asOf(t), q)` would
 * change identity every render. Keying an effect on that identity does not
 * just re-subscribe too often — the effect's own `setState` re-renders,
 * which builds another view, which re-fires the effect: a loop. The seam's
 * `key` is equal iff two views read the same coordinates over the same
 * client, which is the dependency a hook actually means.
 */

import type { Catalog, ReadDb } from "@ripple/alchemy/db";

const DB_SEAM = Symbol.for("ripple.db.seam");

interface DbSeam {
  /** Equal iff two views read the same coordinates over the same client. */
  readonly key: string;
  /** `asOf(t)`'s `t`; `undefined` on a live (or history) view. */
  readonly asOf: number | undefined;
  /** Subscribe to session wakes; `undefined` on an HTTPS-only client. */
  readonly onWake: (cb: () => void) => (() => void) | undefined;
  /** The highest basis the session has seen; `undefined` without a session. */
  readonly t: () => number | undefined;
}

export const seamOf = <C extends Catalog.Any>(
  db: ReadDb<C>,
): DbSeam | undefined =>
  (db as unknown as Partial<Record<symbol, DbSeam>>)[DB_SEAM];

/**
 * The effect / memo dependency a hook keys on `db`: structural when the seam
 * is there (every db a real client builds), identity for anything else (a
 * hand-rolled test double).
 */
export const viewDep = <C extends Catalog.Any>(db: ReadDb<C>): unknown =>
  seamOf(db)?.key ?? db;
