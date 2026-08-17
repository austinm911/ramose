/**
 * @internal The HTTPS half of the transport.
 *
 * One request: JSON in (`toJson`, so instants / bytes / uuids survive), the
 * body out through `fromJson`, and a non-2xx classified into one of the eight
 * tagged failures by {@link fromResponse}. Writes always come through here —
 * `POST /db/:name/transact` is the one writer — and reads fall back to it when
 * the client was given no `WebSocket`.
 *
 * Nothing here is on the `@ripple/alchemy/db` barrel: HTTP is Worker
 * internals, not a second public API.
 */

import { fromJson, toJson } from "@ripple/core/json.ts";
import * as Effect from "effect/Effect";
import { type DbError, fromResponse, NetworkError } from "./Errors.ts";

/**
 * The `fetch` seam, narrowed to what the client actually calls.
 *
 * `typeof fetch` fits it, and so does a Cloudflare service binding
 * (`(url, init) => env.Peer.fetch(url, init)`), which is how a Worker reaches
 * the peer without a public hop.
 */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string | undefined;
  },
) => Promise<Response>;

/** The ambient `fetch`, bound once. */
export const globalFetch: FetchLike = (url, init) =>
  fetch(url, { method: init.method, headers: init.headers, body: init.body });

/** Adapt a standard `fetch` (what {@link ClientOptions} takes) to the seam. */
export const fromStandardFetch = (f: typeof fetch): FetchLike =>
  (url, init) =>
    f(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
    } as RequestInit);

/** Drop `undefined` fields — JSON would otherwise send them as `null`. */
export const compact = (
  o: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
};

export const record = (value: unknown): Record<string, unknown> =>
  (typeof value === "object" && value !== null ? value : {}) as Record<
    string,
    unknown
  >;

/** The read fence, as the header the peer reads it from. */
export const minTHeader = (
  minT: number | undefined,
): Record<string, string> =>
  minT === undefined ? {} : { "x-ripple-min-t": String(minT) };

export interface RawResult {
  readonly body: unknown;
  readonly headers: { get(name: string): string | null };
}

export interface SendOptions {
  readonly fetch: FetchLike;
  /** Peer base URL, no trailing slash. */
  readonly url: string;
  readonly method: string;
  /** Path under the base (`/db/movies/transact`). */
  readonly path: string;
  readonly token?: string | undefined;
  readonly headers?: Record<string, string> | undefined;
  readonly body?: unknown;
}

/** One request, classified. The only place the client touches `fetch`. */
export const send = (
  options: SendOptions,
  attempt = 0,
): Effect.Effect<RawResult, DbError> =>
  sendOnce(options).pipe(
    Effect.catch((e: DbError) => {
      if (attempt + 1 >= 6 || !isTransientPlatform(e)) {
        return Effect.fail(e);
      }
      const ms = Math.min(2000, 150 * 2 ** attempt);
      return Effect.sleep(`${ms} millis`).pipe(
        Effect.andThen(() => send(options, attempt + 1)),
      );
    }),
  );

const isTransientPlatform = (e: DbError): boolean => {
  if (e._tag === "Unavailable") return true;
  if (e._tag === "NetworkError") return true;
  if (e._tag === "InternalError") {
    return /Worker not found|error code: 1042/i.test(e.message);
  }
  return false;
};

const sendOnce = (
  options: SendOptions,
): Effect.Effect<RawResult, DbError> =>
  Effect.gen(function* () {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    };
    if (options.token !== undefined && options.token.length > 0) {
      headers.authorization = `Bearer ${options.token}`;
    }

    const response = yield* Effect.tryPromise({
      try: () =>
        options.fetch(options.url + options.path, {
          method: options.method,
          headers,
          body:
            options.body === undefined
              ? undefined
              : JSON.stringify(toJson(options.body)),
        }),
      catch: (cause) =>
        new NetworkError({
          message: `ripple: ${options.method} ${options.path} failed: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
          cause,
        }),
    });

    const text = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (cause) =>
        new NetworkError({
          message: "ripple: response body could not be read",
          cause,
        }),
    });

    let parsed: unknown;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      parsed = { error: text };
    }

    if (!response.ok) {
      return yield* Effect.fail(
        fromResponse(response.status, parsed, response.headers),
      );
    }
    return { body: fromJson(parsed), headers: response.headers };
  });
