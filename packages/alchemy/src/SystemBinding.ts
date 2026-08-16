/**
 * Shared scaffolding for the Worker-binding implementations of the Ripple
 * system capabilities.
 *
 * A Ripple peer is reached over HTTP, and the cheapest, most private way for
 * one Worker to reach another on Cloudflare is a **service binding**:
 * `env.Sys.fetch(...)` dispatches to the peer Worker inside the same colo,
 * with no DNS, no TLS handshake, and no public hop. So the deploy-time half
 * lowers a `service` binding to the peer onto the host Worker (plus, when
 * configured, the bearer token as an env value), and the runtime half issues
 * ordinary requests through that Fetcher against the synthetic origin
 * `https://ripple.internal` — the peer routes on the path, never the host.
 *
 * No database name is lowered: a system pins none. `system.create(name)`
 * picks it per call, which is what lets one binding serve a database per
 * tenant.
 *
 * Requires `peer` to have been given as a `Cloudflare.Worker` (a service
 * binding needs a script name). With a bare URL, use the `*SystemHttp` layers
 * instead.
 */

import type * as runtime from "@cloudflare/workers-types";
import * as Binding from "alchemy/Binding";
import { isWorker, WorkerEnvironment } from "alchemy/Cloudflare/Workers";
import * as Effect from "effect/Effect";
import type { SystemSource } from "./Client.ts";
import type { System } from "./System.ts";
import { bindToken, envKeys } from "./SystemRuntime.ts";

/** The origin the peer never looks at — service-binding dispatch ignores the host. */
export const SERVICE_ORIGIN = "https://ripple.internal";

export const makeSystemBinding = <Client>(options: {
  makeClient: (source: SystemSource) => Client;
}) =>
  Effect.gen(function* () {
    const env = yield* WorkerEnvironment;

    return Effect.fn(function* (system: System) {
      if (!globalThis.__ALCHEMY_RUNTIME__) {
        // Total: `undefined` when there is no host (a plan-time invoke, or a
        // client provided directly in a script). A host that is not a Worker
        // cannot take a service binding at all — say so loudly rather than
        // deploying something that fails on the first request.
        const host = yield* Binding.Host;
        if (isWorker(host)) {
          // A bare-URL peer has no script name, so the `service` binding
          // below would be lowered with an empty target. Fail here rather
          // than at the Cloudflare API (or, worse, on the first request).
          if (typeof system.Props?.peer === "string") {
            return yield* Effect.die(
              new Error(
                `Ripple's *SystemBinding layers need a script name, and '${system.LogicalId}' was declared with a bare URL peer. Pass a Cloudflare.Worker as \`peer\`, or use the *SystemHttp layers.`,
              ),
            );
          }
          yield* host.bind`${system}`({
            bindings: [
              {
                type: "service",
                name: envKeys(system).service,
                service: system.peerName,
              },
            ],
          });
        } else if (host !== undefined) {
          return yield* Effect.die(
            new Error(
              `Ripple's *SystemBinding layers bind a Cloudflare Worker service binding, and the host is a '${host.Type}'. Use the *SystemHttp layers instead.`,
            ),
          );
        }
      }
      return options.makeClient(yield* makeBindingSource(env, system));
    });
  });

/** The service-binding {@link SystemSource}: `env[LogicalId].fetch`, token from env. */
export const makeBindingSource = (
  env: Record<string, any>,
  system: System,
): Effect.Effect<SystemSource> =>
  Effect.gen(function* () {
    const keys = envKeys(system);
    const token = yield* bindToken(system);
    return {
      endpoint: Effect.gen(function* () {
        return {
          url: SERVICE_ORIGIN,
          token: yield* token,
        };
      }),
      // Lazy — the WorkerEnvironment bindings are not populated until runtime.
      fetch: (url, init) => {
        const peer = (env as Record<string, runtime.Fetcher | undefined>)[
          keys.service
        ];
        if (peer === undefined) {
          return Promise.reject(
            new Error(
              `no service binding "${keys.service}" on this Worker — the peer must be a Cloudflare.Worker, or use the *SystemHttp layers`,
            ),
          );
        }
        return peer.fetch(
          url as runtime.RequestInfo,
          init as runtime.RequestInit,
        ) as unknown as Promise<Response>;
      },
    };
  });
