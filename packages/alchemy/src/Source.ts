/**
 * @internal Where a transport sends, and with which credential.
 *
 * Not exported from `index.ts`: HTTP is Worker internals, not a second public
 * API. The three transports (`*SystemBinding`, `*SystemHttp`, `*SystemLocal`)
 * differ only in how they obtain a {@link SystemSource}; {@link databasesOf}
 * turns any of them into the one client, `Databases`.
 *
 * `endpoint` is an Effect so an Alchemy Output can be read when the capability
 * binds (see `SystemRuntime.ts`); it requires nothing, so neither does any
 * client method.
 */

import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import {
  type DatabasesShape,
  type FetchLike,
  makeDatabases,
} from "./db/internal.ts";

export interface SystemEndpoint {
  /** Peer base URL, no trailing slash (e.g. `https://ripple.example.workers.dev`). */
  readonly url: string;
  /** The peer's one bearer token, used for every database name. */
  readonly token?: Redacted.Redacted<string> | string | undefined;
  /** Extra headers on every request (e.g. `x-ripple-replica-hint`). */
  readonly headers?: Record<string, string> | undefined;
}

export interface SystemSource {
  readonly endpoint: Effect.Effect<SystemEndpoint>;
  readonly fetch: FetchLike;
}

/**
 * The client over a source. No `webSocket`: a Worker reaching the peer through
 * a service binding has no browser socket to give, so reads take the HTTPS
 * fallback and `db.live` is not available on this side of the wire.
 */
export const databasesOf = (source: SystemSource): DatabasesShape =>
  makeDatabases({
    url: source.endpoint.pipe(
      Effect.map((endpoint) => endpoint.url.replace(/\/+$/, "")),
    ),
    token: source.endpoint.pipe(
      Effect.map((endpoint) =>
        Redacted.make(
          endpoint.token === undefined
            ? ""
            : typeof endpoint.token === "string"
              ? endpoint.token
              : Redacted.value(endpoint.token),
        ),
      ),
    ),
    fetch: source.fetch,
  }).databases;
