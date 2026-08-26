/**
 * `Ramose.Server` — a Ramose peer Worker, and every database it serves.
 *
 * The resource owns the peer: it declares the Worker, both Durable Object
 * classes, the pinned compat date, and the fixed binding names. The user
 * names storage and options. `databases:` seeds catalogs at deploy (it is
 * not the directory — that is #215).
 *
 * The explicit `worker:` form is the escape hatch (extra bindings, a
 * user-owned entry). It is validated at deploy: binding names, DO classes,
 * `main` resolution, and `auth` / `token` / `writes` against the Worker env.
 *
 * @resource
 * @product Ramose
 * @category Storage & Databases
 * @section Creating a Server
 * @example The owned form
 * ```typescript
 * export const Server = Ramose.Server("Ramose", {
 *   databases: { todos: Todos },
 *   operations,
 *   auth: { policy, jwt: AUTH },
 * });
 * ```
 *
 * @section Using it from a Worker
 * @example Open a database
 * ```typescript
 * const ramose = yield* Ramose.Databases(Server);
 * const movies = ramose.db("movies", Movies);
 * ```
 *
 * Provide `Ramose.layer` in the Worker's runtime. `db()` hands back a
 * {@link import("./server-db.ts").ServerDb} — no `live` / `livePull`.
 */
import type { Worker } from "alchemy/Cloudflare/Workers";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { type AuthConfig } from "./Auth.ts";
export { DEFAULT_JWT_MAX_TTL } from "./Auth.ts";
import { NetworkError, OperationsCoverageError, PolicyError } from "./db/Errors.ts";
import { type AnyOperations } from "./db/Operation.ts";
import type { Schema } from "./db/index.ts";
import { type PeerRoute, type PeerStorage } from "./peer.ts";
import type { Providers } from "./Providers.ts";
import { type WritesMode } from "./writes.ts";
export type { WritesMode } from "./writes.ts";
export { resolveWrites, WRITES_ENV_KEY } from "./writes.ts";
/** @internal */
export declare const isServer: (value: unknown) => value is Server;
/**
 * @internal The Worker that serves this server: a `Cloudflare.Worker` (the
 * resource, or the Effect that declares it), an explicit `{ url }`, or a bare
 * base URL. The escape hatch — omit it and Server declares the peer.
 */
export type ServerWorker = Worker | {
    readonly url: string | undefined;
    readonly workerName?: string | undefined;
} | string;
/**
 * A catalog to install at deploy, or a schema plus `doc` destined for the
 * directory (#215). Server seeds the catalog; it does not own the metadata.
 */
export type DatabaseSeed = Schema.Any | {
    readonly schema: Schema.Any;
    readonly doc?: string | undefined;
    readonly description?: string | undefined;
};
export declare const isSchemaSeed: (value: DatabaseSeed) => value is Schema.Any;
export declare const schemaOf: (seed: DatabaseSeed) => Schema.Any;
export declare const docOf: (seed: DatabaseSeed) => string | undefined;
/**
 * @internal Deploy-time liveness probe of the server.
 *
 * Both providers run it. A server that never answers is not a hypothetical:
 * under `alchemy dev` the local Worker's proxy binds its port and reports
 * "ready" *before* the bundle is served, so a Worker that never finishes
 * bundling leaves a socket that accepts connections and answers nothing. Every
 * attempt is therefore bounded by {@link timeoutMs} and the whole ladder by
 * {@link deadlineMs} — without those, "unreachable" and "silent" are the same
 * thing to `fetch`, and the deploy hangs forever with no error to print.
 */
export interface ServerProbe {
    /** Total attempts before failing the deploy. @default 30 live, 60 local */
    readonly attempts?: number;
    /** Delay between attempts (ms). @default 2000 live, 250 local */
    readonly delayMs?: number;
    /** Cap on one attempt (ms) — a socket that accepts and never answers. @default 10000 live, 2000 local */
    readonly timeoutMs?: number;
    /** Cap on the whole ladder (ms), retries and sleeps included. @default 120000 live, 30000 local */
    readonly deadlineMs?: number;
}
/** @internal The probe's defaults, per mode. Exported for the tests. */
export declare const PROBE_DEFAULTS: {
    readonly live: {
        readonly attempts: 30;
        readonly delayMs: 2000;
        readonly timeoutMs: 10000;
        readonly deadlineMs: 120000;
    };
    readonly local: {
        readonly attempts: 60;
        readonly delayMs: 250;
        readonly timeoutMs: 2000;
        readonly deadlineMs: 30000;
    };
};
/**
 * A string, or an Alchemy Output / Effect that resolves to one at deploy.
 * Reef's JWKS URL and CORS origins are interpolations over the auth Worker;
 * owned form writes them onto the Worker, hatch form compares by identity.
 */
export type AuthEnvValue = string | object;
/**
 * What the server Worker needs to verify JWTs and enforce a policy.
 *
 * When Server owns the Worker, these are applied onto {@link RamoseEnv}.
 * On the escape hatch they are compared against the Worker's env and
 * fail the deploy on divergence — do not configure auth only on the Worker.
 */
export interface ServerAuth {
    /**
     * Compiled policy JSON (`Ramose.Policy.compile(policy)`). Its presence is
     * what arms enforcement. A verifier without this fails the deploy.
     */
    readonly policy?: string | undefined;
    /**
     * Where the issuer's public keys live. Required once `policy` is set
     * unless {@link jwksJson} is set; setting it without a policy fails
     * the deploy.
     */
    readonly jwksUrl?: AuthEnvValue | undefined;
    /**
     * Literal JWK Set for offline / test verification. Used when
     * {@link jwksUrl} is unset (the Worker prefers the URL if both are
     * bound). Lowers onto `RAMOSE_JWKS_JSON`. Setting it without a policy
     * fails the deploy.
     */
    readonly jwksJson?: AuthEnvValue | undefined;
    /**
     * Name of a service binding on the server Worker to fetch `jwksUrl`
     * through. Required when the issuer is another Worker on the same account.
     */
    readonly jwksService?: string | undefined;
    /**
     * Accepted `iss` values — one, or a comma-separated set. Required once
     * `policy` is set; setting it without a policy fails the deploy.
     */
    readonly issuers?: readonly string[] | AuthEnvValue | undefined;
    /**
     * The `aud` every token must carry. Required once `policy` is set;
     * setting it without a policy fails the deploy.
     */
    readonly aud?: string | undefined;
    /** Cap on `exp - iat`, in seconds. @default 900 */
    readonly maxTtl?: number | undefined;
    /**
     * The pinned verifier/minter contract ({@link import("./Auth.ts").claims}
     * builds the matching payload). Stands in for `issuers`, `aud` and
     * `maxTtl`. Setting it without a policy fails the deploy.
     */
    readonly jwt?: AuthConfig | undefined;
    /** Origins the server answers CORS for once a policy narrows it. */
    readonly allowedOrigins?: readonly string[] | AuthEnvValue | undefined;
    /** Worker→DO shared secret. See {@link internalSecret}. */
    readonly internalSecret?: Redacted.Redacted<string> | string | undefined;
}
/** @internal The public spelling is the argument of {@link Server}. */
export type ServerProps = {
    /**
     * Escape hatch: a user-owned Worker (operations registry, extra bindings).
     * Validated at deploy (STORE / TRANSACTOR / REPLICA, DO class names, `main`).
     * Omit it and Server declares the peer.
     */
    worker?: ServerWorker;
    /** R2 bucket, or the logical id to declare. @default `"Store"` */
    storage?: PeerStorage;
    /** Peer entry. Defaults to `ramose/worker`. A `createServer({ operations })` module goes here. */
    main?: string;
    /** Extra env bindings on the owned Worker (ANALYTICS, AUTH, tuning, …). */
    env?: Record<string, unknown>;
    /** Physical Worker name override. */
    name?: string;
    /** Local-dev port for the owned peer. */
    dev?: {
        readonly port?: number;
    };
    /** Alchemy logical id of the owned Worker. @default `"Peer"` */
    peer?: string;
    /** Zone routes on the owned Worker (`/db/*` on a custom hostname). */
    routes?: PeerRoute[];
    /**
     * Catalogs to install at deploy. A schema, or `{ schema, doc }` — `doc` is
     * data destined for the directory, not a resource-side authority.
     */
    databases?: Record<string, DatabaseSeed>;
    /**
     * The operations registry this deploy ships — the same value the app
     * imports and the peer entry `createServer({ operations })`s. After
     * the health probe, Server compares its ids to `GET /health` and
     * fails the deploy on a missing id. The registry shape (`names` /
     * `cards`) is what later MCP `learn` reads; this issue does not
     * implement that endpoint.
     */
    operations?: AnyOperations;
    /** Override the URL resolved from `worker` — a custom domain, say. */
    url?: string;
    /**
     * Bearer token for this server. Owned form binds it as `RAMOSE_TOKEN`;
     * hatch form requires the Worker env to match. Also the catalog-seed
     * credential.
     */
    token?: Redacted.Redacted<string> | string;
    /**
     * Source of truth for Worker auth env. Owned form applies it; hatch
     * form compares it and fails the deploy on divergence.
     */
    auth?: ServerAuth;
    /**
     * Who may POST raw `/transact`. `"operations"` (the peer default) rejects
     * it for app-class tokens; admin, the seed token, and schema-only txs
     * keep it. `"all"` is the explicit opt-out. Owned form binds
     * `RAMOSE_WRITES`; hatch form compares the effective mode (unset Worker
     * key means `"operations"`) and fails the deploy on a real mismatch.
     * Pass {@link ServerProps.operations} and point `main` at a
     * `createServer({ operations })` module that imports the same registry.
     */
    writes?: WritesMode;
    /**
     * Liveness probe before anything binds to the URL; `false` skips it.
     */
    probe?: ServerProbe | false;
};
/**
 * @internal Env keys the auth fields lower onto. Values are `keyof RamoseEnv`.
 */
export declare const AUTH_ENV_KEYS: {
    readonly policy: "RAMOSE_POLICY";
    readonly jwksUrl: "RAMOSE_JWKS_URL";
    readonly jwksJson: "RAMOSE_JWKS_JSON";
    readonly jwksService: "RAMOSE_JWKS_SERVICE";
    readonly issuers: "RAMOSE_JWT_ISS";
    readonly aud: "RAMOSE_JWT_AUD";
    readonly maxTtl: "RAMOSE_JWT_MAX_TTL";
    readonly allowedOrigins: "RAMOSE_ALLOWED_ORIGINS";
    readonly internalSecret: "RAMOSE_INTERNAL_SECRET";
};
/** @internal Env key `token` lowers onto. */
export declare const TOKEN_ENV_KEY: "RAMOSE_TOKEN";
/**
 * @internal Mint (or pass through) the Worker→DO secret.
 */
export declare const internalSecret: (value?: Redacted.Redacted<string> | string | undefined) => Redacted.Redacted<string>;
/**
 * @internal The server Worker's auth env, as bindings. Unset fields emit no
 * key. A set `policy` also binds {@link internalSecret}.
 */
export declare const authEnv: (peerAuth: ServerAuth | undefined) => Record<string, unknown>;
/**
 * @internal `RAMOSE_TOKEN` from `Server({ token })`. Owned form binds it;
 * hatch form compares it.
 */
export declare const tokenEnv: (token: Redacted.Redacted<string> | string | undefined) => Record<string, Redacted.Redacted<string>>;
/**
 * @internal What the owned Worker receives: `authEnv` plus `RAMOSE_TOKEN`.
 */
export declare const ownedAuthEnv: (peerAuth: ServerAuth | undefined, token: Redacted.Redacted<string> | string | undefined) => Record<string, unknown>;
/**
 * @internal `RAMOSE_WRITES` from `Server({ writes })`. Owned form binds
 * it; hatch form compares it. Unset emits no key — the Worker default is
 * `"operations"`.
 */
export declare const writesEnv: (writes: WritesMode | undefined) => Record<string, WritesMode>;
/**
 * @internal What the owned Worker receives: auth, token, and writes.
 */
export declare const ownedPeerEnv: (peerAuth: ServerAuth | undefined, token: Redacted.Redacted<string> | string | undefined, writes: WritesMode | undefined) => Record<string, unknown>;
/**
 * @internal Completeness: policy implies jwksUrl or jwksJson + issuers +
 * aud, and a bound verifier implies policy. Binding nothing stays open.
 */
export declare const checkAuth: (peerAuth: ServerAuth | undefined) => string | undefined;
/**
 * @internal Hatch form: `auth` / `token` must match the Worker env.
 * A policy on Server with no `RAMOSE_POLICY` on the Worker is a deploy
 * error (fail closed). A policy on the Worker with no `auth.policy` is
 * the same — the Worker env is not a second configuration path.
 * URL workers have no env and are skipped.
 */
export declare const compareAuthToWorker: (peerAuth: ServerAuth | undefined, token: Redacted.Redacted<string> | string | undefined, worker: unknown) => string | undefined;
/**
 * @internal Hatch form: if `writes` is passed, the Worker must carry the
 * same effective mode. Unset `RAMOSE_WRITES` means `"operations"` — the
 * peer default — so `Server({ writes: "operations" })` against a Worker
 * with no key matches. `writes: "all"` against an unset/mismatched key
 * fails: that opt-out would not take effect. URL workers have no env
 * and are skipped.
 */
export declare const compareWritesToWorker: (writes: WritesMode | undefined, worker: unknown) => string | undefined;
/** @internal The pairing the issue asks to warn on, not fail the deploy. */
export declare const WRITES_ALL_POLICY_WARNING = "ramose: writes is \"all\" while a policy is installed \u2014 \"all\" only opens raw /transact when no policy is configured. Data tx stays superuser-only; schema stays schemaClasses-gated.";
/** @internal Match the Worker's `writes.unrecognized` startup log. */
export declare const unrecognizedWritesWarningMessage: (value: unknown) => string;
/**
 * @internal Warning (not a deploy error) when a policy is installed and
 * `writes: "all"` is set — that flag is ignored for data txs.
 */
export declare const writesAllPolicyWarning: (writes: WritesMode | undefined, peerAuth: ServerAuth | undefined, worker: unknown) => string | undefined;
/** @internal Emit {@link writesAllPolicyWarning} at deploy. */
export declare const warnWritesAllPolicy: (writes: WritesMode | undefined, peerAuth: ServerAuth | undefined, worker: unknown) => string | undefined;
/**
 * @internal Warning (not a deploy error) when `RAMOSE_WRITES` is set to
 * something other than `"all"` or `"operations"`. Fail-closed is already
 * correct (`resolveWrites` treats it as `"operations"`); name the value
 * so an operator who typed `ALL` sees why raw writes stayed closed.
 */
export declare const unrecognizedWritesWarning: (worker: unknown) => string | undefined;
/**
 * @internal `Server({ operations })` vs a `/health` body. Missing ids
 * fail the deploy as {@link OperationsCoverageError} so `missing` and
 * `instanceof` survive; extra peer ops are fine. Unset `operations` skips.
 */
export declare const compareOperationsToHealth: (operations: AnyOperations | undefined, health: unknown) => OperationsCoverageError | undefined;
/**
 * @internal `Server({ operations })` vs compiled `auth.policy` `operations:`.
 * An armed name that is not registered fails the deploy. A named-rule or
 * db-dependent v1 arm on a registry-bare (no-`on`) op fails the deploy —
 * those arms need a resolved target and must not be ignored. Unarmed
 * registered ops are allowed (superuser-only). Unset policy or operations
 * skips.
 */
export declare const compareOperationsToPolicy: (operations: AnyOperations | undefined, policyJson: string | undefined) => PolicyError | undefined;
/**
 * @internal One attempt's budget for the coverage `GET /health`.
 *
 * Same resolution as {@link probeHealth}: a caller-supplied
 * `probe.timeoutMs` wins; `probe: false` and an unset probe fall back
 * to the provider default. The coverage fetch is a second request, so
 * it has to share that budget — otherwise a slow peer that just passed
 * a 60s probe still dies on the 10s live / 2s local default.
 */
export declare const coverageTimeoutMs: (probe: ServerProbe | false | undefined, defaults: Required<ServerProbe>) => number;
/** @internal Emit {@link unrecognizedWritesWarning} at deploy. */
export declare const warnUnrecognizedWrites: (worker: unknown) => string | undefined;
export type Server = Resource<"Ramose.Server", ServerProps, {
    /** Base URL, no trailing slash. */
    url: string;
    /** The server Worker's script name, or `""` when it was given as a URL. */
    workerName: string;
    /** The bearer token, when one was configured. */
    token: Redacted.Redacted<string> | undefined;
    /**
     * Catalogs this deploy seeded. Install results, not directory state —
     * `doc` is passed through for #215 and is not authoritative here.
     */
    seeded: readonly {
        readonly name: string;
        readonly t: number;
        readonly doc?: string | undefined;
    }[];
}, never, Providers>;
declare const ServerResource: import("alchemy").ResourceClass<Server>;
export declare const Server: typeof ServerResource;
/** @internal `{ url, workerName }` out of whichever Worker form was given. */
export declare const resolveWorker: (worker: ServerWorker) => {
    url: string | undefined;
    workerName: string;
};
/**
 * @internal One `GET {url}/health`; a non-2xx is a failure so the retry policy
 * sees it, and so is silence past `timeoutMs`.
 *
 * The timeout is the load-bearing part. `fetch` has no deadline of its own, so
 * a socket that completes its TCP handshake and then answers nothing — a local
 * Worker whose bundle never landed, a hung isolate — parks the whole deploy on
 * one unresolved promise. Bounding the attempt turns that into an ordinary
 * failure the ladder can retry and, eventually, report.
 */
export declare const healthOnce: (url: string, timeoutMs: number) => Effect.Effect<void, NetworkError, never>;
/**
 * @internal Probe the server, with retries.
 */
export declare const probeHealth: (url: string, probe: ServerProbe | false | undefined, defaults: Required<ServerProbe>) => Effect.Effect<void, NetworkError, never>;
/** @internal Registered by `providers()`. */
export declare const ServerProvider: () => import("effect/Layer").Layer<Provider.Provider<Server>, never, import("alchemy").AlchemyContext>;
//# sourceMappingURL=Server.d.ts.map