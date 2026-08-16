/**
 * Shared scaffolding for the HTTP-backed Ripple database capabilities.
 *
 * No service binding, no Cloudflare-specific machinery: the client talks to
 * the peer's public URL with the ambient `fetch`. That makes these layers the
 * portable ones — a Worker in another account, a Node/Bun server, a test — and
 * the ones that work when `peer` was given as a plain URL.
 *
 * The peer's URL, the database name and the token ride into the runtime as
 * bound env values (see `DatabaseRuntime.ts`), so under `alchemy dev` the URL
 * is automatically the local dev server's.
 */

import * as Effect from "effect/Effect";
import { type DatabaseSource, globalFetch } from "./Client.ts";
import type { Database } from "./Database.ts";
import { envKeys, runtimeOutput, tokenOutput } from "./DatabaseRuntime.ts";

/** The HTTPS {@link DatabaseSource}: `db.url` + `db.name` + `db.token`, over global `fetch`. */
export const makeHttpSource = (database: Database): DatabaseSource => {
  const keys = envKeys(database);
  const url = runtimeOutput(keys.url, database.url);
  const name = runtimeOutput(keys.name, database.name);
  const token = tokenOutput(database);
  return {
    endpoint: Effect.gen(function* () {
      return {
        url: yield* url,
        name: yield* name,
        token: yield* token,
      };
    }),
    fetch: globalFetch,
  };
};

export const makeDatabaseHttp = <Client>(options: {
  makeClient: (source: DatabaseSource) => Client;
}) =>
  Effect.gen(function* () {
    return Effect.fn(function* (database: Database) {
      return options.makeClient(makeHttpSource(database));
    });
  });
