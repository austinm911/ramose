/**
 * The database-name rule, kept on its own so both halves can use it.
 *
 * A Ripple database is a name, and the only thing that validates it before
 * the peer does is `Client.ts` — `system.create(name)` / `system.connect(name)`
 * check it synchronously, before a request is built. The client must not
 * reach into `System.ts` for the rule: that would drag the whole Alchemy
 * resource machinery into a client that is meant to run anywhere
 * (`Client.make`).
 */

import { InvalidRequest } from "./db/Errors.ts";

/** A Ripple database name, as the peer Worker validates it (`validDbName`). */
export const DATABASE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

/** The failure a name that does not match {@link DATABASE_NAME_RE} produces. */
export const invalidDatabaseName = (name: string): InvalidRequest =>
  new InvalidRequest({
    message: `ripple: invalid database name ${JSON.stringify(name)} — must match ${DATABASE_NAME_RE}`,
  });
