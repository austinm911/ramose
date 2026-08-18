/**
 * `Ripple.Server` — a Ripple peer Worker, and every database it serves.
 *
 * A Ripple database is not a cloud object you create with an API call: it is
 * a *name*. The server Worker routes `/db/:name/*` to a Transactor Durable
 * Object (`idFromName(name)`) and to region-local QueryReplicas, and the log
 * and segments live under `db/<name>/…` in R2. The first transaction
 * materializes it. There is no create-database endpoint, and no list.
 *
 * So the resource is not a database — it is the server that serves them all.
 * It creates nothing: it resolves the Worker's URL and, on a live deploy,
 * proves the Worker is actually up before anything downstream binds to it.
 * Naming a database is a function call (`ripple.db(name, catalog)`), which is
 * why one deploy can serve a database per tenant without a resource per
 * tenant. Installing a catalog on one of those names is
 * {@link import("./Database.ts").Database}.
 *
 * @resource
 * @product Ripple
 * @category Storage & Databases
 * @section Creating a Server
 * @example Declaring the server on its Worker
 * ```typescript
 * import * as Cloudflare from "alchemy/Cloudflare";
 * import * as Ripple from "@ripplegraph/alchemy";
 *
 * const RippleWorker = Cloudflare.Worker("RippleWorker", { main: "./src/index.ts" });
 * export const Server = Ripple.Server("Ripple", { worker: RippleWorker });
 * export const TodosDb = Ripple.Database("todos", { server: Server, catalog: Todos });
 * ```
 *
 * @section Using it from a Worker
 * @example Open a database, then transact and query
 * ```typescript
 * const ripple = yield* Ripple.ReadWriteDatabases(Server);
 * const movies = ripple.db("movies", Movies);
 * const { dbAfter } = yield* movies.transact(function* (tx) {
 *   const ada = yield* tx.entity();
 *   yield* ada.add(User.name, "Ada");
 * });
 * const rows = yield* dbAfter.q(Ripple.query(User).select({ name: User.name }));
 * ```
 *
 * Provide `Ripple.ServerBinding` (a Worker service binding to the server) or
 * `Ripple.ServerHttp` (plain HTTPS — also what an `Alchemy.Action` and
 * `alchemy dev` use) in the Worker's runtime layer. `Ripple.ReadDatabases` is
 * the least-privilege half of `ReadWriteDatabases`: the `db()` it hands back
 * has no `transact` and no `install`.
 */

import type { Worker } from "alchemy/Cloudflare/Workers";
import type { InputProps } from "alchemy/Input";
import * as ProviderLayer from "alchemy/Local/ProviderLayer";
import * as Provider from "alchemy/Provider";
import { isResourceOfType, Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import { InvalidRequest, NetworkError } from "./db/Errors.ts";
import type { Providers } from "./Providers.ts";

/** @internal */
export const isServer = (value: unknown): value is Server =>
  isResourceOfType(value, "Ripple.Server");

/**
 * @internal The Worker that serves this server: a `Cloudflare.Worker` (the
 * resource, or the Effect that declares it), an explicit `{ url }`, or a bare
 * base URL.
 *
 * `workerName` is only needed by {@link import("./ServerBinding.ts")}, which
 * lowers a `service` binding onto the host Worker; `ServerHttp` works from
 * `url` alone.
 */
export type ServerWorker =
  | Worker
  | {
      readonly url: string | undefined;
      readonly workerName?: string | undefined;
    }
  | string;

/** @internal Deploy-time liveness probe of the server (live provider only). */
export interface ServerProbe {
  /** Total attempts before failing the deploy. @default 30 */
  readonly attempts?: number;
  /** Delay between attempts (ms). @default 2000 */
  readonly delayMs?: number;
}

/**
 * What the server Worker needs to verify JWTs and enforce a policy.
 *
 * The Server does **not** push these onto the Worker: spread {@link authEnv}
 * into the Worker's own `env`, and pass the same value here for the
 * deploy-time fail-closed check.
 *
 * With `policy` unset the server runs today's mode: `RIPPLE_TOKEN` if set,
 * otherwise open.
 */
export interface PeerAuth {
  /** Compiled policy JSON (`Ripple.Policy.compile(policy)`). Its presence is what arms enforcement. */
  readonly policy?: string | undefined;
  /** Where the issuer's public keys live. Required once `policy` is set. */
  readonly jwksUrl?: string | undefined;
  /** Accepted `iss` values — one, or a comma-separated set. Required once `policy` is set. */
  readonly issuers?: readonly string[] | string | undefined;
  /** The `aud` every token must carry. Required once `policy` is set. */
  readonly aud?: string | undefined;
  /** Cap on `exp - iat`, in seconds. @default 900 */
  readonly maxTtl?: number | undefined;
  /** Origins the server answers CORS for once a policy narrows it. */
  readonly allowedOrigins?: readonly string[] | string | undefined;
  /** Worker→DO shared secret; every internal fetch carries it. See {@link internalSecret}. */
  readonly internalSecret?: Redacted.Redacted<string> | string | undefined;
}

/** @internal The public spelling is the argument of {@link Server}. */
export type ServerProps = {
  /** The Worker that serves `/db/:name/*` (or a URL, when it is not ours to deploy). */
  worker: ServerWorker;
  /** Override the URL resolved from `worker` — a custom domain, say. */
  url?: string;
  /**
   * Bearer token for this server, when it is deployed with `RIPPLE_TOKEN`.
   * Stored as a `Redacted` attribute and lowered onto consumers as a
   * `secret_text` binding. This is the server's one token: it covers every
   * database name it serves, and is ignored when the Worker has
   * `RIPPLE_TOKEN` unset. It is *not* a data-plane principal on a named
   * database once a policy is configured — a JWT is the only way to be one.
   */
  token?: Redacted.Redacted<string> | string;
  /** The server's auth configuration, for a deploy-time consistency check only. */
  auth?: PeerAuth;
  /** Liveness probe on deploy; `false` skips it. */
  probe?: ServerProbe | false;
};

/** The env keys the server Worker reads its auth configuration from. */
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
 * The server Worker's auth env, as bindings. Unset fields emit no key, so an
 * unconfigured server is byte-for-byte today's server; a set `policy` also
 * binds {@link internalSecret}, since an unset key leaves the Worker→DO gate
 * off.
 *
 * @example
 * ```typescript
 * export const RippleWorker = Cloudflare.Worker("RippleWorker", {
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
  // A configured policy arms the Worker→DO gate, and the gate is off when the
  // key is unset — so a policy always binds a secret, minting one if the caller
  // pinned none. Without a policy, only an explicitly passed secret binds.
  const secret = auth.internalSecret;
  const pinned = secret !== undefined && secret !== "";
  if (pinned || (auth.policy !== undefined && auth.policy !== "")) {
    env[k.internalSecret] = internalSecret(secret);
  }
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

export type Server = Resource<
  "Ripple.Server",
  ServerProps,
  {
    /** Base URL, no trailing slash. */
    url: string;
    /** The server Worker's script name, or `""` when it was given as a URL. */
    workerName: string;
    /** The bearer token, when one was configured. */
    token: Redacted.Redacted<string> | undefined;
  },
  never,
  Providers
>;

const ServerResource = Resource<Server>("Ripple.Server");

/**
 * Declare a Ripple server.
 *
 * The Worker may be given as a `Cloudflare.Worker` *declaration* — the value
 * `Cloudflare.Worker("Worker", …)` returns, which is a yieldable Effect, not
 * a resource instance. Resolving it is the declaration's job: `yield*`ing it
 * here registers (or reuses) the Worker in the stack and hands back the
 * resource proxy whose attributes are `Output`s, which is what makes the
 * engine (a) order this server after its Worker and (b) substitute the real
 * URL at reconcile. Passing the unyielded declaration straight into `Props`
 * would track no dependency and read `url` off a function (`undefined`). Same
 * move as `Cloudflare.DurableObject.from` / `startContainer` make with a
 * Worker/Container declaration.
 */
export const Server = Object.assign(
  (id: string, props: InputProps<ServerProps>) =>
    ServerResource(
      id,
      Effect.gen(function* () {
        const worker = props.worker as
          | ServerWorker
          | Effect.Effect<ServerWorker, unknown, never>;
        return {
          ...props,
          worker: Effect.isEffect(worker) ? yield* worker : worker,
        };
      }) as unknown as Effect.Effect<InputProps<ServerProps>, never, never>,
    ),
  ServerResource,
) as typeof ServerResource;

/** @internal `{ url, workerName }` out of whichever Worker form was given. */
export const resolveWorker = (
  worker: ServerWorker,
): { url: string | undefined; workerName: string } => {
  if (typeof worker === "string") return { url: worker, workerName: "" };
  // At reconcile the engine has replaced the Worker's attribute Outputs with
  // their values, which the `Worker` arm of the union still types as Outputs
  // (same cast Neon's Branch makes for `project.projectId`).
  const resolved = worker as unknown as {
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
        message: `ripple: server at ${url} is unreachable: ${
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
              message: `ripple: server at ${url} answered /health with ${response.status}`,
            }),
          ),
    ),
  );

/**
 * Probe the server, with retries: a `Server` is usually reconciled seconds
 * after the Worker that serves it was uploaded, and workers.dev routes take a
 * moment to propagate.
 */
const probeHealth = (url: string, probe: ServerProbe | false | undefined) => {
  if (probe === false) return Effect.void;
  // workers.dev routes often need tens of seconds after a first upload before
  // they answer; 5×500 ms was empirically too short on real Cloudflare.
  const attempts = Math.max(1, probe?.attempts ?? 30);
  const delayMs = probe?.delayMs ?? 2_000;
  return healthOnce(url).pipe(
    Effect.retry({ times: attempts - 1, schedule: Schedule.spaced(delayMs) }),
  );
};

const attributes = Effect.fn(function* (props: ServerProps, probe: boolean) {
  const badAuth = checkAuth(props.auth);
  if (badAuth !== undefined) return yield* Effect.fail(new InvalidRequest({ message: badAuth }));
  const worker = resolveWorker(props.worker);
  const chosen = props.url ?? worker.url;
  if (chosen === undefined || chosen === "") {
    return yield* Effect.fail(
      new InvalidRequest({
        message:
          "ripple: the server has no URL — pass a deployed Cloudflare.Worker (workers.dev or a custom domain) or an explicit `url`",
      }),
    );
  }
  const url = trimSlashes(chosen);
  if (probe) yield* probeHealth(url, props.probe);
  return {
    url,
    workerName: worker.workerName,
    token: redact(props.token),
  };
});

/**
 * @internal Live provider. `reconcile` is idempotent — there is nothing to
 * create, so it resolves the URL and proves the server answers `/health`.
 *
 * No `stables` and no `diff`: a server pins no name, so nothing about it can
 * force a replacement. Repointing it at another Worker is an ordinary update.
 */
const ProviderLive = () =>
  Provider.succeed(Server, {
    reconcile: Effect.fn(function* ({ news }) {
      return yield* attributes(news, true);
    }),
    read: Effect.fn(function* ({ output }) {
      // Virtual: the persisted state row is the source of truth.
      return output ?? undefined;
    }),
    delete: Effect.fn(function* () {
      // Ripple databases are append-only and immutable; destroying the
      // resource forgets the *server*, it does not erase any log, the segments
      // in R2, or the Durable Objects. Deleting the data is a separate,
      // deliberate act (empty the bucket, delete the DO namespaces).
    }),
  });

/** @internal Local provider (`alchemy dev`): same attributes, no liveness probe. */
const ProviderLocal = () =>
  Provider.succeed(Server, {
    reconcile: Effect.fn(function* ({ news }) {
      return yield* attributes(news, false);
    }),
    read: Effect.fn(function* ({ output }) {
      return output ?? undefined;
    }),
    delete: Effect.fn(function* () {}),
  });

/** @internal Registered by `providers()`. */
export const ServerProvider = () =>
  ProviderLayer.dual(Server, {
    local: () => ProviderLocal(),
    live: () => ProviderLive(),
  });
