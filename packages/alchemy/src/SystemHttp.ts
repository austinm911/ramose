/**
 * Shared scaffolding for the HTTP-backed Ripple system capabilities.
 *
 * No service binding, no Cloudflare-specific machinery: the client talks to
 * the peer's public URL with the ambient `fetch`. That makes these layers the
 * portable ones — a Worker in another account, a Node/Bun server, a test — and
 * the ones that work when `peer` was given as a plain URL.
 *
 * The peer's URL and the token ride into the runtime as bound env values (see
 * `SystemRuntime.ts`), so under `alchemy dev` the URL is automatically the
 * local dev server's. The binds happen when the capability is bound (deploy
 * time), not per request — see the note in `SystemRuntime.ts`.
 */

import * as Effect from "effect/Effect";
import { globalFetch, type SystemSource } from "./Client.ts";
import type { System } from "./System.ts";
import { bindOutput, bindToken, envKeys, required } from "./SystemRuntime.ts";

/** The HTTPS {@link SystemSource}: `system.url` + `system.token`, over global `fetch`. */
export const makeHttpSource = (system: System): Effect.Effect<SystemSource> =>
  Effect.gen(function* () {
    const keys = envKeys(system);
    const url = yield* bindOutput(keys.url, system.url);
    const token = yield* bindToken(system);
    return {
      endpoint: Effect.gen(function* () {
        return {
          url: yield* required(keys.url, url),
          token: yield* token,
        };
      }),
      fetch: globalFetch,
    };
  });

export const makeSystemHttp = <Client>(options: {
  makeClient: (source: SystemSource) => Client;
}) =>
  Effect.gen(function* () {
    return Effect.fn(function* (system: System) {
      return options.makeClient(yield* makeHttpSource(system));
    });
  });
