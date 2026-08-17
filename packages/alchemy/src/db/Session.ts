/** `Session.connect` over the session socket. Same typed surface, different transport. */

import * as Effect from "effect/Effect";
import type { FetchLike, SystemSource } from "../Client.ts";
import { makeReadWriteSystemClient as makeUntypedReadWriteSystemClient } from "../Client.ts";
import { openSession, type Session, type SessionOptions } from "../Session.ts";
import type { AnyCatalog } from "./Catalog.ts";
import { fromReadWrite, type OpenError } from "./Client.ts";
import {
  makeLive,
  type LiveRun,
  type TypedLiveDatabaseClient,
} from "./Live.ts";

/** The socket, and the one database it is bound to. */
export interface TypedSession<C extends AnyCatalog = AnyCatalog> {
  /** The transport: `t`, `onT`, `setToken`, `close`. */
  readonly session: Session;
  /** The catalog-typed client speaking it — `db.live` included. */
  readonly db: TypedLiveDatabaseClient<C>;
}

export interface TypedSessionOptions<C extends AnyCatalog> extends SessionOptions {
  readonly catalog: C;
}

/**
 * Open a session socket and a catalog-typed client over it. Ensures the catalog
 * (one `transact` frame) before handing the client back, same as
 * `makeSystem(...).create(name, catalog)`; the socket is closed if that
 * fails, so a failed `connect` leaves nothing open.
 */
export const connect = <C extends AnyCatalog>(
  options: TypedSessionOptions<C>,
): Effect.Effect<TypedSession<C>, OpenError> =>
  Effect.gen(function* () {
    const session = openSession(options);
    const fetch: FetchLike = session.fetch;
    // resolved per call: routes that fall through to HTTP follow `setToken`
    const source: SystemSource = {
      fetch,
      endpoint: Effect.sync(() => ({
        url: options.url.replace(/\/+$/, ""),
        token: session.token,
        headers: options.headers,
      })),
    };
    const system = fromReadWrite(makeUntypedReadWriteSystemClient(source));
    const db = yield* system
      .create(options.name, options.catalog)
      .pipe(Effect.tapError(() => Effect.sync(() => session.close())));
    const run: LiveRun = Effect.runPromise;
    const client: TypedLiveDatabaseClient<C> = {
      ...db,
      live: makeLive<C>(db, session, run),
    };
    return { session, db: client };
  });
