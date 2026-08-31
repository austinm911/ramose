import * as ProviderLayer from "alchemy/Local/ProviderLayer";
import * as Provider from "alchemy/Provider";
import { isResourceOfType, Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import { DEFAULT_JWT_MAX_TTL } from "./Auth.js";
export { DEFAULT_JWT_MAX_TTL } from "./Auth.js";
import { InvalidRequest, NetworkError } from "./db/Errors.js";
import { declareOwnedPeer, ownedPeerDurableObjects, validatePeerWiring, workerEnvOf, } from "./peer.js";
export const isServer = (value) => isResourceOfType(value, "Ramose.Server");
const trimSlashes = (value) => value.replace(/\/+$/, "");
export const PROBE_DEFAULTS = {
    live: { attempts: 30, delayMs: 2_000, timeoutMs: 10_000, deadlineMs: 120_000 },
    local: { attempts: 60, delayMs: 250, timeoutMs: 2_000, deadlineMs: 30_000 },
};
export const AUTH_ENV_KEYS = {
    jwksUrl: "RAMOSE_JWKS_URL",
    jwksJson: "RAMOSE_JWKS_JSON",
    jwksService: "RAMOSE_JWKS_SERVICE",
    issuers: "RAMOSE_JWT_ISS",
    aud: "RAMOSE_JWT_AUD",
    maxTtl: "RAMOSE_JWT_MAX_TTL",
    allowedOrigins: "RAMOSE_ALLOWED_ORIGINS",
};
const AUTH_COMPARE_KEYS = [
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
const bindAuthFields = (peerAuth) => {
    if (peerAuth === undefined)
        return {};
    const auth = withAuthConfig(peerAuth);
    const k = AUTH_ENV_KEYS;
    const env = {};
    const set = (key, value) => {
        if (isBound(value))
            env[key] = value;
    };
    set(k.jwksUrl, auth.jwksUrl);
    set(k.jwksJson, auth.jwksJson);
    set(k.jwksService, auth.jwksService);
    set(k.issuers, list(auth.issuers));
    set(k.aud, auth.aud);
    set(k.maxTtl, auth.maxTtl === undefined ? undefined : String(auth.maxTtl));
    set(k.allowedOrigins, list(auth.allowedOrigins));
    return env;
};
export const authEnv = (peerAuth) => bindAuthFields(peerAuth);
export const checkAuth = (peerAuth) => {
    if (peerAuth === undefined)
        return undefined;
    const auth = withAuthConfig(peerAuth);
    if (auth.maxTtl !== undefined && (!Number.isFinite(auth.maxTtl) || auth.maxTtl <= 0)) {
        return `ramose: auth.maxTtl must be a positive number of seconds (default ${DEFAULT_JWT_MAX_TTL})`;
    }
    return undefined;
};
const normalizeBinding = (value) => {
    const raw = value;
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
    const a = expected;
    const b = actual;
    if (a === b)
        return true;
    if (typeof a === "object" || typeof b === "object")
        return false;
    return normalizeBinding(a) === normalizeBinding(b);
};
export const compareAuthToWorker = (peerAuth, worker) => {
    if (typeof worker === "string")
        return undefined;
    const env = workerEnvOf(worker);
    if (env === undefined)
        return undefined;
    const expected = bindAuthFields(peerAuth);
    const keys = new Set([...AUTH_COMPARE_KEYS, ...Object.keys(expected)]);
    const diverged = [];
    for (const key of keys) {
        const want = expected[key];
        const got = env[key];
        if (isBound(want) !== isBound(got) || (isBound(want) && isBound(got) && !sameBinding(want, got))) {
            diverged.push(key);
        }
    }
    if (diverged.length === 0)
        return undefined;
    return `ramose: Server auth and the Worker env diverge on ${diverged.join(", ")} — Server({ auth }) is the source of truth`;
};
const ServerResource = Resource("Ramose.Server");
const ownedPeers = new WeakSet();
export const Server = Object.assign((id, props) => {
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
            authEnv: authEnv(props.auth),
            durableObjects,
        });
        if (typeof worker === "object" && worker !== null)
            ownedPeers.add(worker);
        return { ...props, worker };
    }));
}, ServerResource);
export const resolveWorker = (worker) => {
    if (typeof worker === "string")
        return { url: worker, workerName: "" };
    const resolved = worker;
    return { url: resolved?.url, workerName: resolved?.workerName ?? "" };
};
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
const attributes = Effect.fn(function* (props, defaults) {
    const badAuth = checkAuth(props.auth);
    if (badAuth !== undefined)
        return yield* new InvalidRequest({ message: badAuth });
    if (props.worker !== undefined) {
        const badWiring = validatePeerWiring(props.worker);
        if (badWiring !== undefined) {
            return yield* new InvalidRequest({ message: badWiring });
        }
        const hatch = typeof props.worker !== "object" ||
            props.worker === null ||
            !ownedPeers.has(props.worker);
        if (hatch) {
            const badMatch = compareAuthToWorker(props.auth, props.worker);
            if (badMatch !== undefined) {
                return yield* new InvalidRequest({ message: badMatch });
            }
        }
    }
    const worker = resolveWorker(props.worker);
    const chosen = props.url ?? worker.url;
    if (chosen === undefined || chosen === "") {
        return yield* new InvalidRequest({
            message: "ramose: the server has no URL — pass a deployed Cloudflare.Worker (workers.dev or a custom domain) or an explicit `url`",
        });
    }
    const url = trimSlashes(chosen);
    yield* probeHealth(url, props.probe, defaults);
    return {
        url,
        workerName: worker.workerName,
    };
});
const ProviderLive = () => Provider.succeed(Server, {
    reconcile: Effect.fn(function* ({ news }) {
        return yield* attributes(news, PROBE_DEFAULTS.live);
    }),
    read: Effect.fn(function* ({ output }) {
        return output ?? undefined;
    }),
    delete: Effect.fn(function* () {
    }),
});
const ProviderLocal = () => Provider.succeed(Server, {
    reconcile: Effect.fn(function* ({ news }) {
        return yield* attributes(news, PROBE_DEFAULTS.local);
    }),
    read: Effect.fn(function* ({ output }) {
        return output ?? undefined;
    }),
    delete: Effect.fn(function* () { }),
});
// @effect-diagnostics-next-line lazyEffect:off
export const ServerProvider = () => ProviderLayer.dual(Server, {
    local: () => ProviderLocal(),
    live: () => ProviderLive(),
});
//# sourceMappingURL=Server.js.map