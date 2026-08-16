/**
 * `Ripple.System` — a Ripple peer, and every database it serves.
 *
 * A Ripple database is not a cloud object you create with an API call: it is
 * a *name*. The peer Worker routes `/db/:name/*` to a Transactor Durable
 * Object (`idFromName(name)`) and to region-local QueryReplicas, and the log
 * and segments live under `db/<name>/…` in R2. The first transaction
 * materializes it. There is no create-database endpoint, and no list.
 *
 * So the resource is not a database — it is the peer that serves them all. It
 * creates nothing: it resolves the peer's URL and, on a live deploy, proves
 * the peer is actually up before anything downstream binds to it. Naming a
 * database is a runtime act (`system.create(name)`), which is why one deploy
 * can serve a database per tenant without a resource per tenant.
 *
 * @resource
 * @product Ripple
 * @category Storage & Databases
 * @section Creating a System
 * @example Declaring the system on the peer Worker
 * ```typescript
 * import * as Cloudflare from "alchemy/Cloudflare";
 * import * as Ripple from "@ripple/alchemy";
 *
 * export const Peer = Cloudflare.Worker("Worker", { main: "./src/index.ts" });
 * export const Sys = Ripple.System("Sys", { peer: Peer });
 * ```
 *
 * @section Using it from a Worker
 * @example Open a database, then transact and query
 * ```typescript
 * const system = yield* Ripple.ReadWriteSystem(Sys);
 * const movies = yield* system.create("movies");
 * const ack = yield* movies.transact([{ ":user/name": "Ada" }]);
 * const rows = yield* movies.q({ find: ["?n"], where: [["?e", ":user/name", "?n"]] });
 * ```
 *
 * Provide `Ripple.ReadWriteSystemBinding` (a Worker service binding to the
 * peer) or `Ripple.ReadWriteSystemHttp` (plain HTTPS) in the Worker's runtime
 * layer, and `Ripple.ReadWriteSystemLocal` inside an `Alchemy.Action`. Use
 * `Ripple.ReadSystem` / `Ripple.WriteSystem` for least-privilege read- or
 * write-only access — the privilege follows through `create` onto the
 * database client it hands back.
 */

import type { Worker } from "alchemy/Cloudflare/Workers";
import type { InputProps } from "alchemy/Input";
import * as ProviderLayer from "alchemy/Local/ProviderLayer";
import * as Provider from "alchemy/Provider";
import { isResourceOfType, Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import { BadRequest, NetworkError } from "./DatabaseTypes.ts";
import type { Providers } from "./Providers.ts";

export const isSystem = (value: unknown): value is System =>
  isResourceOfType(value, "Ripple.System");

/**
 * The peer that serves this system: a `Cloudflare.Worker` (the resource, or
 * the Effect that declares it), an explicit `{ url }`, or a bare base URL.
 *
 * `workerName` is only needed by the `*SystemBinding` layers, which lower a
 * `service` binding onto the host Worker; the `*Http` / `*Local` layers work
 * from `url` alone.
 */
export type SystemPeer =
  | Worker
  | {
      readonly url: string | undefined;
      readonly workerName?: string | undefined;
    }
  | string;

/** Deploy-time liveness probe of the peer (live provider only). */
export interface SystemProbe {
  /** Total attempts before failing the deploy. @default 5 */
  readonly attempts?: number;
  /** Delay between attempts. @default 500 */
  readonly delayMs?: number;
}

export type SystemProps = {
  /** The peer Worker (or a URL) that serves `/db/:name/*`. */
  peer: SystemPeer;
  /**
   * Bearer token for this peer, when it is deployed with `RIPPLE_TOKENS`.
   * Stored as a `Redacted` attribute and lowered onto consumers as a
   * `secret_text` binding. One token covers every database name the peer
   * serves (`RIPPLE_TOKENS` may map `"*"`).
   */
  token?: Redacted.Redacted<string> | string;
  /** Liveness probe on deploy; `false` skips it. */
  probe?: SystemProbe | false;
};

export type System = Resource<
  "Ripple.System",
  SystemProps,
  {
    /** Peer base URL, no trailing slash. */
    url: string;
    /** The peer Worker's script name, or `""` when the peer was given as a URL. */
    peerName: string;
    /** The bearer token, when one was configured. */
    token: Redacted.Redacted<string> | undefined;
  },
  never,
  Providers
>;

const SystemResource = Resource<System>("Ripple.System");

/**
 * Declare a Ripple system.
 *
 * The peer may be given as a `Cloudflare.Worker` *declaration* — the value
 * `Cloudflare.Worker("Worker", …)` returns, which is a yieldable Effect, not
 * a resource instance. Resolving it is the declaration's job: `yield*`ing it
 * here registers (or reuses) the peer in the stack and hands back the
 * resource proxy whose attributes are `Output`s, which is what makes the
 * engine (a) order this system after the peer and (b) substitute the peer's
 * real URL at reconcile. Passing the unyielded declaration straight into
 * `Props` would track no dependency and read `url` off a function
 * (`undefined`). Same move as `Cloudflare.DurableObject.from` /
 * `startContainer` make with a Worker/Container declaration.
 */
export const System = Object.assign(
  (id: string, props: InputProps<SystemProps>) =>
    SystemResource(
      id,
      Effect.gen(function* () {
        const peer = props.peer as
          | SystemPeer
          | Effect.Effect<SystemPeer, unknown, never>;
        return {
          ...props,
          peer: Effect.isEffect(peer) ? yield* peer : peer,
        };
      }) as unknown as Effect.Effect<InputProps<SystemProps>, never, never>,
    ),
  SystemResource,
) as typeof SystemResource;

export { DATABASE_NAME_RE } from "./DatabaseName.ts";

/** `{ url, workerName }` out of whichever peer form was given. */
export const resolvePeer = (
  peer: SystemPeer,
): { url: string | undefined; workerName: string } => {
  if (typeof peer === "string") return { url: peer, workerName: "" };
  // At reconcile the engine has replaced the Worker's attribute Outputs with
  // their values, which the `Worker` arm of the union still types as Outputs
  // (same cast Neon's Branch makes for `project.projectId`).
  const resolved = peer as unknown as {
    url?: string | undefined;
    workerName?: string | undefined;
  };
  return { url: resolved?.url, workerName: resolved?.workerName ?? "" };
};

const trimSlashes = (url: string): string => url.replace(/\/+$/, "");

const redact = (
  token: Redacted.Redacted<string> | string | undefined,
): Redacted.Redacted<string> | undefined =>
  token === undefined
    ? undefined
    : typeof token === "string"
      ? Redacted.make(token)
      : token;

/** One `GET {url}/health`; a non-2xx is a failure so the retry policy sees it. */
const healthOnce = (url: string) =>
  Effect.tryPromise({
    try: () => fetch(`${trimSlashes(url)}/health`, { method: "GET" }),
    catch: (cause) =>
      new NetworkError({
        message: `ripple: peer at ${url} is unreachable: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
        cause,
      }),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.void
        : Effect.fail(
            new NetworkError({
              message: `ripple: peer at ${url} answered /health with ${response.status}`,
            }),
          ),
    ),
  );

/**
 * Probe the peer, with retries: a `System` is usually reconciled seconds
 * after the Worker that serves it was uploaded, and workers.dev routes take a
 * moment to propagate.
 */
const probeHealth = (url: string, probe: SystemProbe | false | undefined) => {
  if (probe === false) return Effect.void;
  const attempts = Math.max(1, probe?.attempts ?? 5);
  const delayMs = probe?.delayMs ?? 500;
  return healthOnce(url).pipe(
    Effect.retry({ times: attempts - 1, schedule: Schedule.spaced(delayMs) }),
  );
};

const attributes = Effect.fn(function* (props: SystemProps, probe: boolean) {
  const peer = resolvePeer(props.peer);
  if (peer.url === undefined || peer.url === "") {
    return yield* Effect.fail(
      new BadRequest({
        message:
          "ripple: the peer has no URL — pass a deployed Cloudflare.Worker (workers.dev or a custom domain) or an explicit { url }",
      }),
    );
  }
  const url = trimSlashes(peer.url);
  if (probe) yield* probeHealth(url, props.probe);
  return {
    url,
    peerName: peer.workerName,
    token: redact(props.token),
  };
});

/**
 * Live provider. `reconcile` is idempotent — there is nothing to create, so
 * it resolves the peer URL and proves the peer answers `/health`.
 *
 * No `stables` and no `diff`: a system pins no name, so nothing about it can
 * force a replacement. Repointing it at another peer is an ordinary update.
 */
export const ProviderLive = () =>
  Provider.succeed(System, {
    reconcile: Effect.fn(function* ({ news }) {
      return yield* attributes(news, true);
    }),
    read: Effect.fn(function* ({ output }) {
      // Virtual: the persisted state row is the source of truth.
      return output ?? undefined;
    }),
    delete: Effect.fn(function* () {
      // Ripple databases are append-only and immutable; destroying the
      // resource forgets the *peer*, it does not erase any log, the segments
      // in R2, or the Durable Objects. Deleting the data is a separate,
      // deliberate act (empty the bucket, delete the DO namespaces).
    }),
  });

/** Local provider (`alchemy dev`): same attributes, no liveness probe. */
export const ProviderLocal = () =>
  Provider.succeed(System, {
    reconcile: Effect.fn(function* ({ news }) {
      return yield* attributes(news, false);
    }),
    read: Effect.fn(function* ({ output }) {
      return output ?? undefined;
    }),
    delete: Effect.fn(function* () {}),
  });

export const SystemProvider = () =>
  ProviderLayer.dual(System, {
    local: () => ProviderLocal(),
    live: () => ProviderLive(),
  });
