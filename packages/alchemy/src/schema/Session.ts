/** SchemaFx.connect over the session socket. Same typed surface, different transport. */

import type { RuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import type { FetchLike } from "../Client.ts";
import {
  makeReadWriteSystemClient as makeUntypedReadWriteSystemClient,
  systemSource,
} from "../Client.ts";
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
  /** The transport: `t`, `onT`, `close`. */
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
 * `SchemaFx.makeSystem(...).create(name, catalog)`; the socket is closed if that
 * fails, so a failed `connect` leaves nothing open.
 */
export const connect = <C extends AnyCatalog>(
  options: TypedSessionOptions<C>,
): Effect.Effect<TypedSession<C>, OpenError, RuntimeContext> =>
  Effect.gen(function* () {
    const session = openSession(options);
    const fetch: FetchLike = session.fetch;
    const system = fromReadWrite(
      makeUntypedReadWriteSystemClient(
        systemSource({
          url: options.url,
          token: options.token,
          headers: options.headers,
          fetch,
        }),
      ),
    );
    const db = yield* system
      .create(options.name, options.catalog)
      .pipe(Effect.tapError(() => Effect.sync(() => session.close())));
    // live stores run outside Effect, on the services this connect was given
    const context = yield* Effect.context<RuntimeContext>();
    const run: LiveRun = Effect.runPromiseWith(context);
    const client: TypedLiveDatabaseClient<C> = {
      ...db,
      live: makeLive<C>(db, session, run),
    };
    return { session, db: client };
  });
