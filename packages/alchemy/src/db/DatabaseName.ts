/**
 * The database-name rule — public on `@ripple/alchemy/db` (issue #37).
 *
 * A Ripple database is a name, and the only thing that validates it before
 * the peer does is `Db.ts` — `ripple.db(name, catalog)` checks it when the
 * db is built, so a bad name fails the first operation with `InvalidRequest`
 * rather than reaching the peer. Any app that lets users *name* a database
 * (multi-tenant "create workspace") needs the same rule client-side, so
 * `DATABASE_NAME_RE` and `isDatabaseName` are exported from the portable
 * barrel. There is deliberately no `slugify` here: how an app turns
 * "Coral Team" into `coral-team` is the app's business.
 */

import { InvalidRequest } from "./Errors.ts";

/** A Ripple database name, as the peer Worker validates it (`validDbName`). */
export const DATABASE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

/** Whether `name` is a valid Ripple database name ({@link DATABASE_NAME_RE}). */
export const isDatabaseName = (name: string): boolean =>
  DATABASE_NAME_RE.test(name);

/** The failure a name that does not match {@link DATABASE_NAME_RE} produces. */
export const invalidDatabaseName = (name: string): InvalidRequest =>
  new InvalidRequest({
    message: `ripple: invalid database name ${JSON.stringify(name)} — must match ${DATABASE_NAME_RE}`,
  });
