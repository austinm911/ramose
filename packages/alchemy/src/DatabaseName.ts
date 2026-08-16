/**
 * The database-name rule, kept on its own so both halves can use it.
 *
 * `Database.ts` validates the name it pins at deploy; `Client.ts` validates
 * the name handed to `client.for(...)` at runtime. The client must not reach
 * into `Database.ts` for it — that would drag the whole Alchemy resource
 * machinery into a client that is meant to run anywhere (`Client.make`).
 */

import { BadRequest } from "./DatabaseTypes.ts";

/** A Ripple database name, as the peer Worker validates it (`validDbName`). */
export const DATABASE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

/** The failure a name that does not match {@link DATABASE_NAME_RE} produces. */
export const invalidDatabaseName = (name: string): BadRequest =>
  new BadRequest({
    message: `ripple: invalid database name ${JSON.stringify(name)} — must match ${DATABASE_NAME_RE}`,
  });
