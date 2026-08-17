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

/**
 * What the peer Worker needs to verify JWTs and enforce a policy.
 *
 * The System does **not** push these onto the peer — a Worker's `env` is
 * snapshotted when it is declared, long before this resource reconciles. Spread
 * {@link authEnv} into the peer Worker's own `env` instead, and pass the same
 * value here for the deploy-time fail-closed check.
 *
 * With `policy` unset the peer runs today's mode: `RIPPLE_TOKEN` if set,
 * otherwise open.
 */
export interface PeerAuth {
  /** Compiled policy JSON (`SchemaFx.Policy.compile(policy)`). Its presence is what arms enforcement. */
  readonly policy?: string | undefined;
  /** Where the issuer's public keys live. Required once `policy` is set. */
  readonly jwksUrl?: string | undefined;
  /** Accepted `iss` values — one, or a comma-separated set. Required once `policy` is set. */
  readonly issuers?: readonly string[] | string | undefined;
  /** The `aud` every token must carry. Required once `policy` is set. */
  readonly aud?: string | undefined;
  /** Cap on `exp - iat`, in seconds. @default 900 */
  readonly maxTtl?: number | undefined;
  /** Origins the peer answers CORS for once a policy narrows it. */
  readonly allowedOrigins?: readonly string[] | string | undefined;
  /** Worker→DO shared secret; every internal fetch carries it. See {@link internalSecret}. */
  readonly internalSecret?: Redacted.Redacted<string> | string | undefined;
}

export type SystemProps = {
  /** The peer Worker (or a URL) that serves `/db/:name/*`. */
  peer: SystemPeer;
  /**
   * Bearer token for this peer, when it is deployed with `RIPPLE_TOKEN`.
   * Stored as a `Redacted` attribute and lowered onto consumers as a
   * `secret_text` binding. This is the peer's one token: it covers every
   * database name the peer serves, and is ignored when the peer has
   * `RIPPLE_TOKEN` unset. It is *not* a data-plane principal on a named
   * database once a policy is configured — a JWT is the only way to be one.
   */
  token?: Redacted.Redacted<string> | string;
  /**
   * The peer's auth configuration, for a deploy-time consistency check only.
   * The env itself belongs on the peer Worker: `env: { …, ...authEnv(auth) }`.
   */
  auth?: PeerAuth;
  /** Liveness probe on deploy; `false` skips it. */
  probe?: SystemProbe | false;
};

/** The env keys the peer Worker reads its auth configuration from. */
export const AUTH_ENV_KEYS = {
  policy: "RIPPLE_POLICY",
  jwksUrl: "RIPPLE_JWKS_URL",
  issuers: "RIPPLE_JWT_ISS",
  aud: "RIPPLE_JWT_AUD",
  maxTtl: "RIPPLE_JWT_MAX_TTL",
  allowedOrigins: "RIPPLE_ALLOWED_ORIGINS",
  internalSecret: "RIPPLE_INTERNAL_SECRET",
} as const satisfies Record<keyof PeerAuth, string>;

/** Cap on a token's lifetime when `RIPPLE_JWT_MAX_TTL` is unset, in seconds. */
export const DEFAULT_JWT_MAX_TTL = 900;

const list = (value: readonly string[] | string | undefined): string | undefined => {
  const items = (typeof value === "string" ? value.split(",") : (value ?? []))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return items.length === 0 ? undefined : items.join(",");
};

/**
 * Mint (or pass through) the Worker→DO secret.
 *
 * The Worker and both Durable Object classes are one script, so one env key
 * covers all three and they rotate together. Pin it by passing a value or
 * setting `RIPPLE_INTERNAL_SECRET`; otherwise every deploy gets a fresh one.
 */
export const internalSecret = (
  value?: Redacted.Redacted<string> | string | undefined,
): Redacted.Redacted<string> => {
  if (value !== undefined && value !== "") {
    return typeof value === "string" ? Redacted.make(value) : value;
  }
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Redacted.make(
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""),
  );
};

/**
 * The peer Worker's auth env, as bindings. Spread it into the Worker's own
 * `env` beside `RIPPLE_TOKEN`; unset fields emit no key, so an unconfigured
 * peer is byte-for-byte today's peer.
 *
 * @example
 * ```typescript
 * export const Worker = Cloudflare.Worker("Worker", {
 *   main: "./packages/worker/src/index.ts",
 *   env: { STORE: Store, ...Ripple.authEnv({ policy, jwksUrl, issuers, aud }) },
 * });
 * ```
 */
export const authEnv = (
  auth: PeerAuth | undefined,
): Record<string, string | Redacted.Redacted<string>> => {
  if (auth === undefined) return {};
  const k = AUTH_ENV_KEYS;
  const env: Record<string, string | Redacted.Redacted<string>> = {};
  const set = (key: string, value: string | Redacted.Redacted<string> | undefined) => {
    if (value !== undefined && value !== "") env[key] = value;
  };
  set(k.policy, auth.policy);
  set(k.jwksUrl, auth.jwksUrl);
  set(k.issuers, list(auth.issuers));
  set(k.aud, auth.aud);
  set(k.maxTtl, auth.maxTtl === undefined ? undefined : String(auth.maxTtl));
  set(k.allowedOrigins, list(auth.allowedOrigins));
  const secret = auth.internalSecret;
  if (secret !== undefined && secret !== "") env[k.internalSecret] = internalSecret(secret);
  return env;
};

/**
 * Fail closed at deploy: a policy with no verifier configured would deny every
 * `/db/*` at runtime, so it fails here instead.
 */
const checkAuth = (auth: PeerAuth | undefined): string | undefined => {
  if (auth === undefined || auth.policy === undefined || auth.policy === "") return undefined;
  const missing: string[] = [];
  if (auth.jwksUrl === undefined || auth.jwksUrl === "") missing.push(AUTH_ENV_KEYS.jwksUrl);
  if (list(auth.issuers) === undefined) missing.push(AUTH_ENV_KEYS.issuers);
  if (auth.aud === undefined || auth.aud === "") missing.push(AUTH_ENV_KEYS.aud);
  if (missing.length > 0) {
    return `ripple: auth.policy is set but ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not — a configured policy makes JWT verification mandatory, and an incomplete verifier denies every /db/*`;
  }
  if (auth.maxTtl !== undefined && (!Number.isFinite(auth.maxTtl) || auth.maxTtl <= 0)) {
    return `ripple: auth.maxTtl must be a positive number of seconds (default ${DEFAULT_JWT_MAX_TTL})`;
  }
  return undefined;
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
  const badAuth = checkAuth(props.auth);
  if (badAuth !== undefined) return yield* Effect.fail(new BadRequest({ message: badAuth }));
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
