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
import * as ProviderLayer from "alchemy/Local/ProviderLayer";
import * as Provider from "alchemy/Provider";
import { isResourceOfType, Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import { DEFAULT_JWT_MAX_TTL } from "./Auth.js";
export { DEFAULT_JWT_MAX_TTL } from "./Auth.js";
import { installCatalog } from "./Database.js";
import { InvalidRequest, NetworkError, OperationsCoverageError, PolicyError } from "./db/Errors.js";
import { checkOperationsCoverage, } from "./db/Operation.js";
import { checkOperationsPolicyCoverage } from "./db/Policy.js";
import { trimSlashes } from "./db/http.js";
import { declareOwnedPeer, ownedPeerDurableObjects, validatePeerWiring, workerEnvOf, } from "./peer.js";
import { WRITES_ENV_KEY, isUnrecognizedWrites, resolveWrites } from "./writes.js";
export { resolveWrites, WRITES_ENV_KEY } from "./writes.js";
/** @internal */
export const isServer = (value) => isResourceOfType(value, "Ramose.Server");
export const isSchemaSeed = (value) => typeof value === "object" && value !== null && "_tag" in value && value._tag === "Schema";
export const schemaOf = (seed) => isSchemaSeed(seed) ? seed : seed.schema;
export const docOf = (seed) => {
    if (isSchemaSeed(seed))
        return undefined;
    const doc = seed.doc ?? seed.description;
    return doc === undefined || doc === "" ? undefined : doc;
};
/** @internal The probe's defaults, per mode. Exported for the tests. */
export const PROBE_DEFAULTS = {
    live: { attempts: 30, delayMs: 2_000, timeoutMs: 10_000, deadlineMs: 120_000 },
    local: { attempts: 60, delayMs: 250, timeoutMs: 2_000, deadlineMs: 30_000 },
};
/**
 * @internal Env keys the auth fields lower onto. Values are `keyof RamoseEnv`.
 */
export const AUTH_ENV_KEYS = {
    policy: "RAMOSE_POLICY",
    jwksUrl: "RAMOSE_JWKS_URL",
    jwksJson: "RAMOSE_JWKS_JSON",
    jwksService: "RAMOSE_JWKS_SERVICE",
    issuers: "RAMOSE_JWT_ISS",
    aud: "RAMOSE_JWT_AUD",
    maxTtl: "RAMOSE_JWT_MAX_TTL",
    allowedOrigins: "RAMOSE_ALLOWED_ORIGINS",
    internalSecret: "RAMOSE_INTERNAL_SECRET",
};
/** @internal Env key `token` lowers onto. */
export const TOKEN_ENV_KEY = "RAMOSE_TOKEN";
const AUTH_COMPARE_KEYS = [
    AUTH_ENV_KEYS.policy,
    AUTH_ENV_KEYS.jwksUrl,
    AUTH_ENV_KEYS.jwksJson,
    AUTH_ENV_KEYS.jwksService,
    AUTH_ENV_KEYS.issuers,
    AUTH_ENV_KEYS.aud,
    AUTH_ENV_KEYS.maxTtl,
    AUTH_ENV_KEYS.allowedOrigins,
];
const withAuthConfig = (auth) => auth.jwt === undefined
    ? auth
    : {
        ...auth,
        issuers: auth.issuers ?? auth.jwt.issuer,
        aud: auth.aud ?? auth.jwt.audience,
        maxTtl: auth.maxTtl ?? auth.jwt.ttl,
    };
const isBound = (value) => value !== undefined && value !== "";
const list = (value) => {
    if (!isBound(value))
        return undefined;
    if (typeof value === "string" || (Array.isArray(value) && value.every((item) => typeof item === "string"))) {
        const items = (typeof value === "string" ? value.split(",") : value)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        return items.length === 0 ? undefined : items.join(",");
    }
    return value;
};
/**
 * @internal Mint (or pass through) the Worker→DO secret.
 */
export const internalSecret = (value) => {
    if (value !== undefined && value !== "") {
        return typeof value === "string" ? Redacted.make(value) : value;
    }
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Redacted.make(Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
};
/**
 * @internal The server Worker's auth env, as bindings. Unset fields emit no
 * key. Output / Effect values pass through (Reef's JWKS URL and origins).
 * A set `policy` also binds {@link internalSecret} unless `mintSecret` is
 * false (hatch compare — an unpinned secret is minted per call and would
 * never match).
 */
const bindAuthFields = (peerAuth, mintSecret) => {
    if (peerAuth === undefined)
        return {};
    const auth = withAuthConfig(peerAuth);
    const k = AUTH_ENV_KEYS;
    const env = {};
    const set = (key, value) => {
        if (isBound(value))
            env[key] = value;
    };
    set(k.policy, auth.policy);
    set(k.jwksUrl, auth.jwksUrl);
    set(k.jwksJson, auth.jwksJson);
    set(k.jwksService, auth.jwksService);
    set(k.issuers, list(auth.issuers));
    set(k.aud, auth.aud);
    set(k.maxTtl, auth.maxTtl === undefined ? undefined : String(auth.maxTtl));
    set(k.allowedOrigins, list(auth.allowedOrigins));
    const secret = auth.internalSecret;
    const pinned = isBound(secret);
    if (pinned || (mintSecret && isBound(auth.policy))) {
        env[k.internalSecret] = internalSecret(secret);
    }
    return env;
};
/**
 * @internal The server Worker's auth env, as bindings. Unset fields emit no
 * key. A set `policy` also binds {@link internalSecret}.
 */
export const authEnv = (peerAuth) => bindAuthFields(peerAuth, true);
/**
 * @internal `RAMOSE_TOKEN` from `Server({ token })`. Owned form binds it;
 * hatch form compares it.
 */
export const tokenEnv = (token) => {
    if (token === undefined || token === "")
        return {};
    return {
        [TOKEN_ENV_KEY]: typeof token === "string" ? Redacted.make(token) : token,
    };
};
/**
 * @internal What the owned Worker receives: `authEnv` plus `RAMOSE_TOKEN`.
 */
export const ownedAuthEnv = (peerAuth, token) => ({
    ...authEnv(peerAuth),
    ...tokenEnv(token),
});
/**
 * @internal `RAMOSE_WRITES` from `Server({ writes })`. Owned form binds
 * it; hatch form compares it. Unset emits no key — the Worker default is
 * `"operations"`.
 */
export const writesEnv = (writes) => writes === undefined ? {} : { [WRITES_ENV_KEY]: writes };
/**
 * @internal What the owned Worker receives: auth, token, and writes.
 */
export const ownedPeerEnv = (peerAuth, token, writes) => ({
    ...ownedAuthEnv(peerAuth, token),
    ...writesEnv(writes),
});
/**
 * @internal Completeness: policy implies jwksUrl or jwksJson + issuers +
 * aud, and a bound verifier implies policy. Binding nothing stays open.
 */
export const checkAuth = (peerAuth) => {
    if (peerAuth === undefined)
        return undefined;
    const auth = withAuthConfig(peerAuth);
    const verifier = [];
    if (isBound(auth.jwksUrl))
        verifier.push(AUTH_ENV_KEYS.jwksUrl);
    if (isBound(auth.jwksJson))
        verifier.push(AUTH_ENV_KEYS.jwksJson);
    if (isBound(auth.jwksService))
        verifier.push(AUTH_ENV_KEYS.jwksService);
    if (list(auth.issuers) !== undefined)
        verifier.push(AUTH_ENV_KEYS.issuers);
    if (isBound(auth.aud))
        verifier.push(AUTH_ENV_KEYS.aud);
    if (!isBound(peerAuth.policy)) {
        if (verifier.length === 0)
            return undefined;
        return `ramose: ${verifier.join(", ")} ${verifier.length === 1 ? "is" : "are"} set but auth.policy is not — a bound verifier without a policy leaves the server open to everyone`;
    }
    const missing = [];
    if (!isBound(auth.jwksUrl) && !isBound(auth.jwksJson))
        missing.push(AUTH_ENV_KEYS.jwksUrl);
    if (list(auth.issuers) === undefined)
        missing.push(AUTH_ENV_KEYS.issuers);
    if (!isBound(auth.aud))
        missing.push(AUTH_ENV_KEYS.aud);
    if (missing.length > 0) {
        return `ramose: auth.policy is set but ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not — a configured policy makes JWT verification mandatory, and an incomplete verifier denies every /db/*`;
    }
    if (auth.maxTtl !== undefined && (!Number.isFinite(auth.maxTtl) || auth.maxTtl <= 0)) {
        return `ramose: auth.maxTtl must be a positive number of seconds (default ${DEFAULT_JWT_MAX_TTL})`;
    }
    return undefined;
};
const unwrapBinding = (value) => Redacted.isRedacted(value) ? Redacted.value(value) : value;
const normalizeBinding = (value) => {
    const raw = unwrapBinding(value);
    if (typeof raw === "number" && Number.isFinite(raw))
        return String(raw);
    if (typeof raw === "string") {
        return raw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
            .sort()
            .join(",");
    }
    if (Array.isArray(raw) && raw.every((item) => typeof item === "string" || typeof item === "number")) {
        return raw
            .map((item) => String(item).trim())
            .filter((s) => s.length > 0)
            .sort()
            .join(",");
    }
    return raw;
};
const sameBinding = (expected, actual) => {
    if (expected === actual)
        return true;
    const a = unwrapBinding(expected);
    const b = unwrapBinding(actual);
    if (a === b)
        return true;
    if (typeof a === "object" || typeof b === "object")
        return false;
    return normalizeBinding(a) === normalizeBinding(b);
};
/**
 * @internal Hatch form: `auth` / `token` must match the Worker env.
 * A policy on Server with no `RAMOSE_POLICY` on the Worker is a deploy
 * error (fail closed). A policy on the Worker with no `auth.policy` is
 * the same — the Worker env is not a second configuration path.
 * URL workers have no env and are skipped.
 */
export const compareAuthToWorker = (peerAuth, token, worker) => {
    if (typeof worker === "string")
        return undefined;
    const env = workerEnvOf(worker);
    if (env === undefined)
        return undefined;
    const hasAuthPolicy = isBound(peerAuth?.policy);
    const hasWorkerPolicy = isBound(env[AUTH_ENV_KEYS.policy]);
    if (hasAuthPolicy && !hasWorkerPolicy) {
        return "ramose: auth.policy is set but the Worker has no RAMOSE_POLICY — a configured policy that never reaches the Worker leaves the server open to everyone";
    }
    if (hasWorkerPolicy && !hasAuthPolicy) {
        return "ramose: the Worker has RAMOSE_POLICY but Ramose.Server was not given auth.policy — pass auth on Server; do not configure the policy only on the Worker";
    }
    const expected = bindAuthFields(peerAuth, false);
    if (isBound(token))
        Object.assign(expected, tokenEnv(token));
    const keys = new Set([...AUTH_COMPARE_KEYS, TOKEN_ENV_KEY, ...Object.keys(expected)]);
    const diverged = [];
    const pinnedSecret = isBound(peerAuth?.internalSecret);
    for (const key of keys) {
        if (key === AUTH_ENV_KEYS.internalSecret && !pinnedSecret)
            continue;
        if (key === TOKEN_ENV_KEY && !isBound(token))
            continue;
        const want = expected[key];
        const got = env[key];
        if (isBound(want) !== isBound(got) || (isBound(want) && isBound(got) && !sameBinding(want, got))) {
            diverged.push(key);
        }
    }
    if (diverged.length === 0)
        return undefined;
    if (diverged.length === 1 && diverged[0] === TOKEN_ENV_KEY) {
        return "ramose: Server token does not match the Worker's RAMOSE_TOKEN — Server({ token }) is the seed credential and must be the same secret the Worker enforces";
    }
    return `ramose: Server auth and the Worker env diverge on ${diverged.join(", ")} — Server({ auth, token }) is the source of truth`;
};
/**
 * @internal Hatch form: if `writes` is passed, the Worker must carry the
 * same effective mode. Unset `RAMOSE_WRITES` means `"operations"` — the
 * peer default — so `Server({ writes: "operations" })` against a Worker
 * with no key matches. `writes: "all"` against an unset/mismatched key
 * fails: that opt-out would not take effect. URL workers have no env
 * and are skipped.
 */
export const compareWritesToWorker = (writes, worker) => {
    if (writes === undefined)
        return undefined;
    if (typeof worker === "string")
        return undefined;
    const env = workerEnvOf(worker);
    if (env === undefined)
        return undefined;
    const got = env[WRITES_ENV_KEY];
    const workerMode = resolveWrites(undefined, isBound(got) ? got : undefined);
    if (resolveWrites(writes, undefined) === workerMode)
        return undefined;
    if (!isBound(got)) {
        return `ramose: Server writes is "all" but the Worker has no RAMOSE_WRITES — unset means "operations", so raw /transact would stay closed`;
    }
    return `ramose: Server writes and the Worker env diverge on RAMOSE_WRITES — Server({ writes }) is ${JSON.stringify(writes)}, the Worker has ${JSON.stringify(got)}`;
};
/** @internal The pairing the issue asks to warn on, not fail the deploy. */
export const WRITES_ALL_POLICY_WARNING = 'ramose: writes is "all" while a policy is installed — "all" only opens raw /transact when no policy is configured. Data tx stays superuser-only; schema stays schemaClasses-gated.';
/** @internal Match the Worker's `writes.unrecognized` startup log. */
export const unrecognizedWritesWarningMessage = (value) => `ramose: RAMOSE_WRITES=${JSON.stringify(value)} is not "all" or "operations"; using "operations"`;
const workerWritesOf = (worker) => {
    if (typeof worker === "string")
        return undefined;
    return workerEnvOf(worker)?.[WRITES_ENV_KEY];
};
const workerPolicyOf = (worker) => {
    if (typeof worker === "string")
        return undefined;
    return workerEnvOf(worker)?.[AUTH_ENV_KEYS.policy];
};
/**
 * @internal Warning (not a deploy error) when a policy is installed and
 * `writes: "all"` is set — that flag is ignored for data txs.
 */
export const writesAllPolicyWarning = (writes, peerAuth, worker) => {
    const policy = isBound(peerAuth?.policy) ? peerAuth?.policy : workerPolicyOf(worker);
    if (!isBound(policy))
        return undefined;
    if (resolveWrites(writes, workerWritesOf(worker)) !== "all")
        return undefined;
    return WRITES_ALL_POLICY_WARNING;
};
/** @internal Emit {@link writesAllPolicyWarning} at deploy. */
export const warnWritesAllPolicy = (writes, peerAuth, worker) => {
    const message = writesAllPolicyWarning(writes, peerAuth, worker);
    if (message !== undefined)
        console.warn(message);
    return message;
};
/**
 * @internal Warning (not a deploy error) when `RAMOSE_WRITES` is set to
 * something other than `"all"` or `"operations"`. Fail-closed is already
 * correct (`resolveWrites` treats it as `"operations"`); name the value
 * so an operator who typed `ALL` sees why raw writes stayed closed.
 */
export const unrecognizedWritesWarning = (worker) => {
    const got = workerWritesOf(worker);
    if (!isUnrecognizedWrites(got))
        return undefined;
    return unrecognizedWritesWarningMessage(got);
};
const healthOperationsOf = (health) => {
    if (typeof health !== "object" || health === null)
        return [];
    const listed = health.operations;
    if (!Array.isArray(listed))
        return [];
    return listed.filter((n) => typeof n === "string");
};
/**
 * @internal `Server({ operations })` vs a `/health` body. Missing ids
 * fail the deploy as {@link OperationsCoverageError} so `missing` and
 * `instanceof` survive; extra peer ops are fine. Unset `operations` skips.
 */
export const compareOperationsToHealth = (operations, health) => {
    if (operations === undefined)
        return undefined;
    try {
        checkOperationsCoverage(operations, healthOperationsOf(health));
        return undefined;
    }
    catch (error) {
        if (error instanceof OperationsCoverageError)
            return error;
        throw error;
    }
};
/**
 * @internal `Server({ operations })` vs compiled `auth.policy` `operations:`.
 * An armed name that is not registered fails the deploy. A named-rule or
 * db-dependent v1 arm on a registry-bare (no-`on`) op fails the deploy —
 * those arms need a resolved target and must not be ignored. Unarmed
 * registered ops are allowed (superuser-only). Unset policy or operations
 * skips.
 */
export const compareOperationsToPolicy = (operations, policyJson) => {
    if (operations === undefined || policyJson === undefined || !isBound(policyJson))
        return undefined;
    let parsed;
    try {
        parsed = JSON.parse(policyJson);
    }
    catch {
        return undefined;
    }
    if (parsed == null || typeof parsed !== "object")
        return undefined;
    const armed = parsed.operations;
    if (armed == null || typeof armed !== "object" || Array.isArray(armed))
        return undefined;
    try {
        checkOperationsPolicyCoverage(operations, armed);
        return undefined;
    }
    catch (error) {
        if (error instanceof PolicyError)
            return error;
        throw error;
    }
};
/**
 * @internal One attempt's budget for the coverage `GET /health`.
 *
 * Same resolution as {@link probeHealth}: a caller-supplied
 * `probe.timeoutMs` wins; `probe: false` and an unset probe fall back
 * to the provider default. The coverage fetch is a second request, so
 * it has to share that budget — otherwise a slow peer that just passed
 * a 60s probe still dies on the 10s live / 2s local default.
 */
export const coverageTimeoutMs = (probe, defaults) => probe === false
    ? defaults.timeoutMs
    : (probe?.timeoutMs ?? defaults.timeoutMs);
const fetchHealthJson = (url, timeoutMs) => Effect.tryPromise({
    try: (signal) => fetch(`${trimSlashes(url)}/health`, { method: "GET", signal }).then(async (response) => {
        let body = {};
        try {
            body = await response.json();
        }
        catch {
            body = {};
        }
        if (!response.ok) {
            throw new Error(`health ${response.status}`);
        }
        return body;
    }),
    catch: (cause) => new NetworkError({
        message: `ramose: server at ${url} is unreachable: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
    }),
}).pipe(Effect.timeoutOrElse({
    duration: `${Math.max(1, timeoutMs)} millis`,
    orElse: () => Effect.fail(new NetworkError({
        message: `ramose: server at ${url} accepted the connection but did not answer GET /health within ${timeoutMs}ms`,
    })),
}));
/** @internal Emit {@link unrecognizedWritesWarning} at deploy. */
export const warnUnrecognizedWrites = (worker) => {
    const message = unrecognizedWritesWarning(worker);
    if (message !== undefined)
        console.warn(message);
    return message;
};
const ServerResource = Resource("Ramose.Server");
/**
 * Declare a Ramose server.
 *
 * Without `worker`, Server declares the peer (R2, both DO classes, the
 * Worker, {@link import("./peer.ts").PEER_COMPAT}, fixed bindings) and
 * applies `auth` / `token` / `writes` onto its env. With `worker`, that
 * form is validated — bindings, DO classes, `main`, and `auth` / `token`
 * / `writes` against the Worker env — and kept as the escape hatch.
 */
const ownedPeers = new WeakSet();
export const Server = Object.assign((id, props) => {
    // Durable Object declarations must be created here — at the stack
    // module's `Ramose.Server(…)` call — so Alchemy registers them as
    // top-level `TransactorDO` / `QueryReplicaDO` resources. Creating
    // them inside `Worker({ env })` nests them as `[Worker/TRANSACTOR]`
    // bindings and never gives the namespaces their own logical ids.
    const durableObjects = props.worker === undefined ? ownedPeerDurableObjects() : undefined;
    return ServerResource(id, Effect.gen(function* () {
        const given = props.worker;
        if (given !== undefined) {
            const worker = Effect.isEffect(given) ? yield* given : given;
            return { ...props, worker };
        }
        const worker = yield* declareOwnedPeer({
            storage: props.storage,
            main: props.main,
            env: props.env,
            name: props.name,
            dev: props.dev,
            peer: props.peer,
            routes: props.routes,
            authEnv: ownedPeerEnv(props.auth, props.token, props.writes),
            durableObjects,
        });
        if (typeof worker === "object" && worker !== null)
            ownedPeers.add(worker);
        return { ...props, worker };
    }));
}, ServerResource);
/** @internal `{ url, workerName }` out of whichever Worker form was given. */
export const resolveWorker = (worker) => {
    if (typeof worker === "string")
        return { url: worker, workerName: "" };
    const resolved = worker;
    return { url: resolved?.url, workerName: resolved?.workerName ?? "" };
};
const redact = (token) => token === undefined
    ? undefined
    : typeof token === "string"
        ? Redacted.make(token)
        : token;
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
export const healthOnce = (url, timeoutMs) => Effect.tryPromise({
    try: (signal) => fetch(`${trimSlashes(url)}/health`, { method: "GET", signal }),
    catch: (cause) => new NetworkError({
        message: `ramose: server at ${url} is unreachable: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
    }),
}).pipe(Effect.flatMap((response) => response.ok
    ? Effect.void
    : Effect.fail(new NetworkError({
        message: `ramose: server at ${url} answered /health with ${response.status}`,
    }))), Effect.timeoutOrElse({
    duration: `${Math.max(1, timeoutMs)} millis`,
    orElse: () => Effect.fail(new NetworkError({
        message: `ramose: server at ${url} accepted the connection but did not answer GET /health within ${timeoutMs}ms`,
    })),
}));
/**
 * @internal Probe the server, with retries.
 */
export const probeHealth = (url, probe, defaults) => {
    if (probe === false)
        return Effect.void;
    const attempts = Math.max(1, probe?.attempts ?? defaults.attempts);
    const delayMs = probe?.delayMs ?? defaults.delayMs;
    const timeoutMs = probe?.timeoutMs ?? defaults.timeoutMs;
    const deadlineMs = probe?.deadlineMs ?? defaults.deadlineMs;
    return healthOnce(url, timeoutMs).pipe(Effect.retry({ times: attempts - 1, schedule: Schedule.spaced(delayMs) }), Effect.timeoutOrElse({
        duration: `${Math.max(1, deadlineMs)} millis`,
        orElse: () => Effect.fail(new NetworkError({
            message: `ramose: server at ${url} did not answer GET /health within ${deadlineMs}ms — is the Worker that serves it running? Under \`alchemy dev\` a Worker whose bundle failed still binds its port and answers nothing.`,
        })),
    }));
};
const seedDatabases = (url, token, databases) => Effect.gen(function* () {
    if (databases === undefined)
        return [];
    const seeded = [];
    for (const [name, seed] of Object.entries(databases)) {
        const report = yield* installCatalog({
            name,
            url,
            token,
            schema: schemaOf(seed),
        });
        const doc = docOf(seed);
        seeded.push(doc === undefined ? { name: report.name, t: report.t } : { name: report.name, t: report.t, doc });
    }
    return seeded;
});
const attributes = Effect.fn(function* (props, defaults) {
    const badAuth = checkAuth(props.auth);
    if (badAuth !== undefined)
        return yield* Effect.fail(new InvalidRequest({ message: badAuth }));
    if (props.worker !== undefined) {
        const badWiring = validatePeerWiring(props.worker);
        if (badWiring !== undefined) {
            return yield* Effect.fail(new InvalidRequest({ message: badWiring }));
        }
        const hatch = typeof props.worker !== "object" ||
            props.worker === null ||
            !ownedPeers.has(props.worker);
        if (hatch) {
            const badMatch = compareAuthToWorker(props.auth, props.token, props.worker);
            if (badMatch !== undefined) {
                return yield* Effect.fail(new InvalidRequest({ message: badMatch }));
            }
            const badWrites = compareWritesToWorker(props.writes, props.worker);
            if (badWrites !== undefined) {
                return yield* Effect.fail(new InvalidRequest({ message: badWrites }));
            }
        }
        warnWritesAllPolicy(props.writes, props.auth, props.worker);
        warnUnrecognizedWrites(props.worker);
    }
    const worker = resolveWorker(props.worker);
    const chosen = props.url ?? worker.url;
    if (chosen === undefined || chosen === "") {
        return yield* Effect.fail(new InvalidRequest({
            message: "ramose: the server has no URL — pass a deployed Cloudflare.Worker (workers.dev or a custom domain) or an explicit `url`",
        }));
    }
    const url = trimSlashes(chosen);
    yield* probeHealth(url, props.probe, defaults);
    if (props.operations !== undefined) {
        const body = yield* fetchHealthJson(url, coverageTimeoutMs(props.probe, defaults));
        const badOps = compareOperationsToHealth(props.operations, body);
        if (badOps !== undefined) {
            return yield* Effect.fail(badOps);
        }
        const authPolicy = props.auth?.policy;
        const policyJson = isBound(authPolicy) ? authPolicy : undefined;
        const badPolicyOps = compareOperationsToPolicy(props.operations, policyJson);
        if (badPolicyOps !== undefined) {
            return yield* Effect.fail(badPolicyOps);
        }
    }
    const token = redact(props.token);
    const seeded = yield* seedDatabases(url, token, props.databases);
    return {
        url,
        workerName: worker.workerName,
        token,
        seeded,
    };
});
const ProviderLive = () => Provider.succeed(Server, {
    reconcile: Effect.fn(function* ({ news }) {
        return yield* attributes(news, PROBE_DEFAULTS.live);
    }),
    read: Effect.fn(function* ({ output }) {
        // Virtual: the persisted state row is the source of truth.
        return output ?? undefined;
    }),
    delete: Effect.fn(function* () {
        // Ramose databases are append-only and immutable; destroying the
        // resource forgets the *server*, it does not erase any log, the segments
        // in R2, or the Durable Objects. Deleting the data is a separate,
        // deliberate act (empty the bucket, delete the DO namespaces).
    }),
});
/**
 * @internal Local provider (`alchemy dev`): the same attributes, and the same
 * probe on a tighter ladder.
 *
 * It used to skip the probe on the reasoning that a local Worker the engine
 * already ordered us after must be up. It need not be. `alchemy dev` binds the
 * Worker's proxy port and logs "ready" before the first bundle is served, so a
 * peer whose bundle never lands — a `main` the bundler cannot resolve, a syntax
 * error in user code — leaves a socket that accepts connections and answers
 * nothing. Skipping the probe here handed that server to `Ramose.Database`,
 * whose install then blocked on an unresolvable `fetch` until the run was torn
 * down and printed a bare `fail` with no reason. Probing puts the failure on
 * the resource that owns the URL, with the URL in the message.
 */
const ProviderLocal = () => Provider.succeed(Server, {
    reconcile: Effect.fn(function* ({ news }) {
        return yield* attributes(news, PROBE_DEFAULTS.local);
    }),
    read: Effect.fn(function* ({ output }) {
        return output ?? undefined;
    }),
    delete: Effect.fn(function* () { }),
});
/** @internal Registered by `providers()`. */
export const ServerProvider = () => ProviderLayer.dual(Server, {
    local: () => ProviderLocal(),
    live: () => ProviderLive(),
});
//# sourceMappingURL=Server.js.map