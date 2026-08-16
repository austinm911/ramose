/**
 * Shared scaffolding for the Worker-binding implementations of the Ripple
 * database capabilities.
 *
 * A Ripple database is reached over HTTP, and the cheapest, most private way
 * for one Worker to reach another on Cloudflare is a **service binding**:
 * `env.Movies.fetch(...)` dispatches to the peer Worker inside the same colo,
 * with no DNS, no TLS handshake, and no public hop. So the deploy-time half
 * lowers a `service` binding to the peer onto the host Worker (plus the
 * database name and, when configured, the bearer token as env values), and
 * the runtime half issues ordinary requests through that Fetcher against the
 * synthetic origin `https://ripple.internal` — the peer routes on the path,
 * never the host.
 *
 * Requires `peer` to have been given as a `Cloudflare.Worker` (a service
 * binding needs a script name). With a bare URL, use the `*DatabaseHttp`
 * layers instead.
 */

import type * as runtime from "@cloudflare/workers-types";
import * as Binding from "alchemy/Binding";
import { isWorker, WorkerEnvironment } from "alchemy/Cloudflare/Workers";
import * as Effect from "effect/Effect";
import type { DatabaseSource } from "./Client.ts";
import type { Database } from "./Database.ts";
import { envKeys, runtimeOutput, tokenOutput } from "./DatabaseRuntime.ts";

/** The origin the peer never looks at — service-binding dispatch ignores the host. */
export const SERVICE_ORIGIN = "https://ripple.internal";

export const makeDatabaseBinding = <Client>(options: {
  makeClient: (source: DatabaseSource) => Client;
}) =>
  Effect.gen(function* () {
    const env = yield* WorkerEnvironment;

    return Effect.fn(function* (database: Database) {
      if (!globalThis.__ALCHEMY_RUNTIME__) {
        // Total: `undefined` when there is no host (a plan-time invoke, or a
        // client provided directly in a script). A host that is not a Worker
        // cannot take a service binding at all — say so loudly rather than
        // deploying something that fails on the first request.
        const host = yield* Binding.Host;
        if (isWorker(host)) {
          yield* host.bind`${database}`({
            bindings: [
              {
                type: "service",
                name: envKeys(database).service,
                service: database.peerName,
              },
            ],
          });
        } else if (host !== undefined) {
          return yield* Effect.die(
            new Error(
              `Ripple's *DatabaseBinding layers bind a Cloudflare Worker service binding, and the host is a '${host.Type}'. Use the *DatabaseHttp layers instead.`,
            ),
          );
        }
      }
      return options.makeClient(makeBindingSource(env, database));
    });
  });

/** The service-binding {@link DatabaseSource}: `env[LogicalId].fetch`, name + token from env. */
export const makeBindingSource = (
  env: Record<string, any>,
  database: Database,
): DatabaseSource => {
  const keys = envKeys(database);
  const name = runtimeOutput(keys.name, database.name);
  const token = tokenOutput(database);
  return {
    endpoint: Effect.gen(function* () {
      return {
        url: SERVICE_ORIGIN,
        name: yield* name,
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
            `no service binding "${keys.service}" on this Worker — the peer must be a Cloudflare.Worker, or use the *DatabaseHttp layers`,
          ),
        );
      }
      return peer.fetch(
        url as runtime.RequestInfo,
        init as runtime.RequestInit,
      ) as unknown as Promise<Response>;
    },
  };
};
