import { R2NodeStore, cacheApiTier, dbPrefix, prefixedBucket } from "../internal/storage/index.js";
import { internalHeaders } from "../internal/transactor/index.js";
import { Unauthorized } from "../db/Errors.js";
import { SERVER_IDENTITY_INCOMPATIBLE, ServerIdentityIncompatible, } from "../internal/replication/server-identity.js";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { UpstreamError } from "./errors.js";
const sources = new Map();
const MAX_SOURCES = 64;
export function segmentSource(env, db) {
    let source = sources.get(db);
    if (!source) {
        if (sources.size >= MAX_SOURCES)
            sources.delete(sources.keys().next().value);
        const cache = globalThis.caches?.default;
        source = new R2NodeStore(prefixedBucket(env.STORE, dbPrefix(db)), { maxNodes: 2048, ...(cache ? { cache: cacheApiTier(cache) } : {}) });
        sources.set(db, source);
    }
    return source;
}
export function clearSegmentSources() {
    sources.clear();
}
export function replicaId(env, db, region, shards = 1, hint = hintFor(region)) {
    const shard = shards > 1 ? fnv1a(`${db}|${region}`) % shards : 0;
    return env.REPLICA.idFromName(hint ? `${db}|${region}|${hint}|${shard}` : `${db}|${region}|${shard}`);
}
function fnv1a(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
}
export function regionOf(request) {
    const cf = request.cf;
    return cf?.continent ?? "global";
}
const HINTS = new Set(["wnam", "enam", "sam", "weur", "eeur", "apac", "oc", "afr", "me"]);
const COLO_HINT = {
    IAD: "enam", EWR: "enam", ATL: "enam", ORD: "enam", MIA: "enam", BOS: "enam", YYZ: "enam", YUL: "enam", DFW: "enam", IAH: "enam", MSP: "enam", DTW: "enam", CLT: "enam", PHL: "enam", PIT: "enam", BNA: "enam", MCI: "enam", STL: "enam", TPA: "enam", RIC: "enam", BUF: "enam", CMH: "enam", IND: "enam", MEM: "enam", JAX: "enam", MCO: "enam", RDU: "enam", CLE: "enam", MKE: "enam", OMA: "enam", OKC: "enam", MSY: "enam", SAT: "enam", AUS: "enam", YOW: "enam", YHZ: "enam",
    SJC: "wnam", LAX: "wnam", SEA: "wnam", SFO: "wnam", PDX: "wnam", DEN: "wnam", PHX: "wnam", LAS: "wnam", SLC: "wnam", SAN: "wnam", SMF: "wnam", YVR: "wnam", YYC: "wnam", ABQ: "wnam", HNL: "wnam", ANC: "wnam", BOI: "wnam", ELP: "wnam", TUS: "wnam", GEG: "wnam", RNO: "wnam", YEG: "wnam",
};
export function coloHint(colo) {
    return colo ? COLO_HINT[colo.toUpperCase()] : undefined;
}
export function hintOf(request, env) {
    const cf = request.cf;
    const pick = env?.RAMOSE_REPLICA_HINT ?? "auto";
    if (pick === "auto")
        return coloHint(cf?.colo) ?? hintFor(regionOf(request));
    if (pick && HINTS.has(pick))
        return pick;
    return hintFor(regionOf(request));
}
export function coloOf(request) {
    return String(request.cf?.colo ?? "unknown");
}
export function coloHeader(request) {
    return { "x-ramose-colo": coloOf(request) };
}
export function nearestReplica(env, db, request, trustedHint) {
    const region = regionOf(request);
    const hint = trustedHint ?? hintOf(request, env);
    return env.REPLICA.get(replicaId(env, db, region, 1, hint), { locationHint: hint });
}
export const watchBasisChanges = (env, db, request) => {
    let currentBasis;
    let failWatch;
    const failed = new Promise((resolve) => {
        failWatch = resolve;
    });
    const changes = Stream.callback((out) => Effect.gen(function* () {
        const expectedDeployment = env.CF_VERSION_METADATA?.id;
        if (typeof expectedDeployment !== "string" || expectedDeployment.length === 0) {
            return yield* new Unauthorized({});
        }
        const health = new URL("/health", request.url);
        const stub = nearestReplica(env, db, request);
        const response = yield* Effect.tryPromise({
            try: () => stub.fetch(`https://replica/watch?db=${encodeURIComponent(db)}`, {
                headers: {
                    Upgrade: "websocket",
                    ...coloHeader(request),
                    ...internalHeaders(env),
                    "x-ramose-live-deployment": expectedDeployment,
                    "x-ramose-live-health": health.href,
                },
            }),
            catch: () => new Unauthorized({}),
        });
        const ws = response.webSocket;
        if (response.status !== 101 || ws === null) {
            return yield* new Unauthorized({});
        }
        const fail = () => {
            failWatch();
            Queue.failCauseUnsafe(out, Cause.fail(new Unauthorized({})));
            try {
                ws.close(1011, "live watch failed");
            }
            catch {
            }
        };
        ws.addEventListener("message", (event) => {
            try {
                const frame = JSON.parse(String(event.data));
                const basis = frame.basis;
                if (!Number.isSafeInteger(frame.t) ||
                    basis?.v !== 1 ||
                    basis.db !== db ||
                    basis.t !== frame.t ||
                    basis.root === undefined ||
                    !Array.isArray(basis.novelty))
                    return fail();
                currentBasis = basis;
                if (frame.kind === "ready")
                    Queue.offerUnsafe(out, "ready");
                else if (frame.kind === "basis")
                    Queue.offerUnsafe(out, "change");
                else
                    fail();
            }
            catch {
                fail();
            }
        });
        ws.addEventListener("close", fail);
        ws.addEventListener("error", fail);
        ws.accept();
        yield* Effect.addFinalizer(() => Effect.sync(() => {
            try {
                ws.close(1000, "live response closed");
            }
            catch {
            }
        }));
    }), { bufferSize: 1, strategy: "sliding" });
    return { changes, currentBasis: () => currentBasis, failed };
};
const rejectQuarantined = async (response, keyId) => {
    if (response.status !== 409)
        return;
    const body = (await response.clone().json().catch(() => undefined));
    if (body?.error !== SERVER_IDENTITY_INCOMPATIBLE)
        return;
    throw new ServerIdentityIncompatible({
        persisted: typeof body.persisted === "string" ? body.persisted : "unknown",
        current: keyId,
    });
};
export const replicationRevisionStoreId = (env, database, binding) => env.REPLICA.idFromName(`ramose-replication-revisions-v1|${database}|${binding}`);
const replicationRevisionStore = (env, database, binding) => env.REPLICA.get(replicationRevisionStoreId(env, database, binding));
export const rememberReplicationRevision = async (env, database, record) => {
    const response = await replicationRevisionStore(env, database, record.binding).fetch(`https://replica/replication/revision?db=${encodeURIComponent(database)}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...internalHeaders(env),
        },
        body: JSON.stringify({ action: "remember", ...record }),
    });
    await rejectQuarantined(response, record.keyId);
    if (!response.ok)
        throw new UpstreamError({
            status: response.status,
            body: await response.text(),
        });
};
export const resolveReplicationRevision = async (env, database, revision, binding, keyId) => {
    const response = await replicationRevisionStore(env, database, binding).fetch(`https://replica/replication/revision?db=${encodeURIComponent(database)}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...internalHeaders(env),
        },
        body: JSON.stringify({ action: "resolve", revision, binding, keyId }),
    });
    await rejectQuarantined(response, keyId);
    if (!response.ok)
        throw new UpstreamError({
            status: response.status,
            body: await response.text(),
        });
    const body = (await response.json());
    return body.found === true && Number.isSafeInteger(body.basisT) &&
        body.basisT >= 0
        ? body.basisT
        : undefined;
};
export function wantsBasisCache(_request, env) {
    const h = env?.RAMOSE_CACHE_BASIS ?? "1";
    return h !== "0";
}
export function cacheModeOf(_request, env) {
    const h = env?.RAMOSE_CACHE_MODE;
    return h === "peer" ? "peer" : "ttl";
}
const basisCache = new Map();
export const BASIS_TTL_MS = 5_000;
export const BASIS_SAFETY_TTL_MS = 10 * 60_000;
const MIN_T_RETRIES = 5;
const MIN_T_RETRY_MS = 20;
export const basisCacheDecision = (useCache, mode, now, cached, minT) => {
    if (!useCache)
        return "off";
    if (cached === undefined)
        return "miss";
    const ttl = mode === "peer" ? BASIS_SAFETY_TTL_MS : BASIS_TTL_MS;
    if (now - cached.at >= ttl)
        return "expired";
    if (minT !== undefined && cached.t < minT)
        return "min-t";
    return "hit";
};
export const shouldReplaceCachedBasis = (cachedT, fetchedT) => cachedT === undefined || cachedT <= fetchedT;
export function invalidateBasis(db) {
    for (const k of basisCache.keys())
        if (k.startsWith(`${db}|`))
            basisCache.delete(k);
}
export function clearBasisCache() {
    basisCache.clear();
}
export const basisCacheEnabled = (request, env, options = {}) => options.bypassCache !== true &&
    (options.useCache ?? wantsBasisCache(request, env));
export const effectiveBasisMinT = (clientMinT, transactorT) => {
    if (clientMinT === undefined)
        return transactorT;
    if (transactorT === undefined)
        return clientMinT;
    return Math.max(clientMinT, transactorT);
};
const fetchTransactorT = async (env, db) => {
    const stub = env.TRANSACTOR.get(env.TRANSACTOR.idFromName(db));
    const res = await stub.fetch(`https://transactor/info?db=${encodeURIComponent(db)}`, { headers: internalHeaders(env) });
    if (!res.ok)
        throw new UpstreamError({ status: res.status, body: await res.text() });
    const body = (await res.json());
    if (!Number.isSafeInteger(body.t) || body.t < 0) {
        throw new UpstreamError({
            status: 502,
            body: JSON.stringify({ error: "transactor returned an invalid basis" }),
        });
    }
    return body.t;
};
export async function fetchBasisWithStats(env, db, request, options = {}) {
    const useCache = basisCacheEnabled(request, env, options);
    const mode = options.cacheMode ?? cacheModeOf(request, env);
    const transactorT = options.authoritativeFence === true
        ? await fetchTransactorT(env, db)
        : undefined;
    const minT = effectiveBasisMinT(options.minimumBasis, transactorT);
    const hint = options.replicaHint ?? hintOf(request, env);
    const key = `${db}|${hint ?? ""}`;
    const hit = basisCache.get(key);
    const reason = basisCacheDecision(useCache, mode, Date.now(), hit === undefined ? undefined : { t: hit.basis.t, at: hit.at }, minT);
    if (reason === "hit" && hit !== undefined) {
        return { basis: hit.basis, hit: true, reason, calls: 0, behind: false };
    }
    const stub = nearestReplica(env, db, request, hint);
    let calls = 0;
    let basis;
    for (;;) {
        calls++;
        const res = await stub.fetch(`https://replica/basis?db=${encodeURIComponent(db)}`, {
            headers: {
                ...coloHeader(request),
                ...internalHeaders(env),
                ...(minT === undefined ? {} : { "x-ramose-min-t": String(minT) }),
            },
        });
        if (!res.ok)
            throw new UpstreamError({ status: res.status, body: await res.text() });
        basis = (await res.json());
        if (minT === undefined || basis.t >= minT || calls > MIN_T_RETRIES)
            break;
        await new Promise((r) => setTimeout(r, MIN_T_RETRY_MS));
    }
    const behind = minT !== undefined && basis.t < minT;
    if (options.authoritativeFence === true && behind) {
        throw new UpstreamError({
            status: 503,
            body: JSON.stringify({ error: "replica behind authoritative basis" }),
        });
    }
    if (useCache) {
        const cur = basisCache.get(key);
        if (shouldReplaceCachedBasis(cur?.basis.t, basis.t)) {
            basisCache.set(key, { basis, at: Date.now() });
        }
    }
    return { basis, hit: false, reason, calls, behind };
}
export async function fetchBasis(env, db, request, options = {}) {
    return (await fetchBasisWithStats(env, db, request, options)).basis;
}
export function basisHeaders(request, env, f, options = {}) {
    return {
        "x-ramose-basis-t": String(f.basis.t),
        "x-ramose-basis-hit": f.hit ? "1" : "0",
        "x-ramose-basis-reason": f.reason,
        "x-ramose-basis-calls": String(f.calls),
        ...(f.behind ? { "x-ramose-basis-behind": "1" } : {}),
        "x-ramose-replica-hint": options.replicaHint ?? hintOf(request, env) ?? "",
        "x-ramose-cache-basis": (options.useCache ?? wantsBasisCache(request, env)) ? "1" : "0",
        "x-ramose-cache-mode": options.cacheMode ?? cacheModeOf(request, env),
        "x-ramose-colo": String(request.cf?.colo ?? ""),
    };
}
export function hintFor(continent) {
    switch (continent) {
        case "NA": return "wnam";
        case "EU": return "weur";
        case "AS": return "apac";
        case "OC": return "oc";
        case "SA": return "sam";
        case "AF": return "afr";
        default: return undefined;
    }
}
//# sourceMappingURL=peer.js.map