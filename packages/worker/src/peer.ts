/**
 * Peer-side segment source and basis fetching.
 *
 * SegmentSource = R2NodeStore(memory LRU → Cache API → R2). One instance per
 * database per isolate (module scope) so warm isolates serve repeat queries
 * with zero R2 reads. R2 keys are namespaced per database (db/<name>/…);
 * the Cache API tier is keyed by content hash and shared.
 */

import { R2NodeStore, cacheApiTier, dbPrefix, prefixedBucket } from "@ripple/storage";
import type { RippleEnv } from "@ripple/transactor";
import type { Basis } from "@ripple/replica";

const sources = new Map<string, R2NodeStore>();
const MAX_SOURCES = 64;

export function segmentSource(env: RippleEnv, db: string): R2NodeStore {
  let source = sources.get(db);
  if (!source) {
    if (sources.size >= MAX_SOURCES) sources.delete(sources.keys().next().value!);
    const cache = (globalThis as any).caches?.default;
    source = new R2NodeStore(prefixedBucket(env.STORE, dbPrefix(db)), { maxNodes: 2048, cache: cache ? cacheApiTier(cache) : undefined });
    sources.set(db, source);
  }
  return source;
}

/** Deterministic replica choice: hash(db, region) → one of `shards` replicas per region.
 *  The location hint is part of the id, so switching hints (e.g. wnam → enam) creates a
 *  fresh DO placed near the new hint instead of reusing one placed elsewhere. */
export function replicaId(env: RippleEnv, db: string, region: string, shards = 1, hint: string | undefined = hintFor(region)): DurableObjectId {
  const shard = shards > 1 ? fnv1a(`${db}|${region}`) % shards : 0;
  return env.REPLICA.idFromName(hint ? `${db}|${region}|${hint}|${shard}` : `${db}|${region}|${shard}`);
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Nearest region key for a request (Cloudflare colo continent, falls back to "global"). */
export function regionOf(request: Request): string {
  const cf = (request as any).cf as { continent?: string; colo?: string } | undefined;
  return cf?.continent ?? "global";
}

// ---- read-path knobs (per request by header, default by env, else the shipped default) ----
//
//   x-ripple-replica-hint: wnam|enam|…|auto|continent
//                                            DO placement (hint is part of the replica id); `auto` = colo→hint
//                                            (IAD→enam, SJC→wnam, …), `continent` = the old NA→wnam mapping.
//                                            Default: env RIPPLE_REPLICA_HINT, else `auto` (gate 2026-08-16: same-colo
//                                            basis misses 12–13 ms vs 68–77 ms; see bench/RESULTS.md).
//   x-ripple-cache-basis: 0|1                 reuse an isolate-cached basis instead of calling the replica.
//                                            Default: env RIPPLE_CACHE_BASIS, else 1 (gate: 0 ms server p50 on hits).
//   x-ripple-cache-mode: ttl|peer             ttl  = entry expires after 5 s (cross-isolate freshness bound = 5 s).
//                                            peer = no freshness timer; only a write through this isolate or an
//                                                   `x-ripple-min-t` the entry can't satisfy refetches; a long safety
//                                                   TTL only bounds memory. Default: env RIPPLE_CACHE_MODE, else ttl
//                                                   (gate: peer measured identical to ttl on the hit path, and its
//                                                   cross-isolate staleness without min-t could not be measured).
//   x-ripple-min-t: <t>                       client's last seen t; the read refetches if the cached basis is older
//                                            (honored in both modes — read-your-writes across isolates).

export type CacheMode = "ttl" | "peer";

const HINTS = new Set(["wnam", "enam", "sam", "weur", "eeur", "apac", "oc", "afr", "me"]);

/** Cloudflare colo (IATA) → DO location hint. East-of-the-Mississippi US/CA colos → enam, west → wnam. */
const COLO_HINT: Record<string, string> = {
  // enam
  IAD: "enam", EWR: "enam", ATL: "enam", ORD: "enam", MIA: "enam", BOS: "enam", YYZ: "enam", YUL: "enam", DFW: "enam", IAH: "enam", MSP: "enam", DTW: "enam", CLT: "enam", PHL: "enam", PIT: "enam", BNA: "enam", MCI: "enam", STL: "enam", TPA: "enam", RIC: "enam", BUF: "enam", CMH: "enam", IND: "enam", MEM: "enam", JAX: "enam", MCO: "enam", RDU: "enam", CLE: "enam", MKE: "enam", OMA: "enam", OKC: "enam", MSY: "enam", SAT: "enam", AUS: "enam", YOW: "enam", YHZ: "enam",
  // wnam
  SJC: "wnam", LAX: "wnam", SEA: "wnam", SFO: "wnam", PDX: "wnam", DEN: "wnam", PHX: "wnam", LAS: "wnam", SLC: "wnam", SAN: "wnam", SMF: "wnam", YVR: "wnam", YYC: "wnam", ABQ: "wnam", HNL: "wnam", ANC: "wnam", BOI: "wnam", ELP: "wnam", TUS: "wnam", GEG: "wnam", RNO: "wnam", YEG: "wnam",
};

/** colo → hint (undefined when unknown). */
export function coloHint(colo: string | undefined): string | undefined {
  return colo ? COLO_HINT[colo.toUpperCase()] : undefined;
}

/** Location hint for a request. Header wins, then env RIPPLE_REPLICA_HINT, then the continent default.
 *  `auto` (header or env) resolves colo→hint and falls back to the continent when the colo is unknown. */
export function hintOf(request: Request, env?: Pick<RippleEnv, "RIPPLE_REPLICA_HINT">): string | undefined {
  const cf = (request as any).cf as { colo?: string } | undefined;
  const pick = request.headers.get("x-ripple-replica-hint") ?? env?.RIPPLE_REPLICA_HINT ?? "auto";
  if (pick === "auto") return coloHint(cf?.colo) ?? hintFor(regionOf(request));
  if (pick && HINTS.has(pick)) return pick;
  return hintFor(regionOf(request)); // "continent" or anything unknown
}

/**
 * Colo of the inbound edge request. Worker→DO subrequests carry no `request.cf`,
 * so the DO can only learn its caller's colo if we forward it as a header.
 */
export function coloOf(request: Request): string {
  return String((request as any).cf?.colo ?? "unknown");
}
export function coloHeader(request: Request): Record<string, string> {
  return { "x-ripple-colo": coloOf(request) };
}

/** Nearest replica stub for a request (deterministic id + location hint). */
export function nearestReplica(env: RippleEnv, db: string, request: Request): DurableObjectStub {
  const region = regionOf(request);
  const hint = hintOf(request, env);
  return env.REPLICA.get(replicaId(env, db, region, 1, hint), { locationHint: hint } as any);
}

export function wantsBasisCache(request: Request, env?: Pick<RippleEnv, "RIPPLE_CACHE_BASIS">): boolean {
  const h = request.headers.get("x-ripple-cache-basis") ?? env?.RIPPLE_CACHE_BASIS ?? "1";
  return h !== "0";
}

export function cacheModeOf(request: Request, env?: Pick<RippleEnv, "RIPPLE_CACHE_MODE">): CacheMode {
  const h = request.headers.get("x-ripple-cache-mode") ?? env?.RIPPLE_CACHE_MODE;
  return h === "peer" ? "peer" : "ttl";
}

/** `x-ripple-min-t` (client's last seen t), or undefined. */
export function minTOf(request: Request): number | undefined {
  const h = request.headers.get("x-ripple-min-t");
  if (h === null || h === "") return undefined;
  const n = Number(h);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

// ---- isolate basis cache ----
// Keyed by db|hint. Reused until a write through this Worker (invalidateBasis), the entry
// ages past the mode's TTL, or a read carries an x-ripple-min-t the entry can't satisfy.
const basisCache = new Map<string, { basis: Basis; at: number }>();
export const BASIS_TTL_MS = 5_000; // ttl mode: cross-isolate freshness bound
export const BASIS_SAFETY_TTL_MS = 10 * 60_000; // peer mode: memory bound only, not a consistency promise
const MIN_T_RETRIES = 5; // replica may lag the transactor by a WS hop; poll briefly for min-t
const MIN_T_RETRY_MS = 20;

export function invalidateBasis(db: string): void {
  for (const k of basisCache.keys()) if (k.startsWith(`${db}|`)) basisCache.delete(k);
}

/** Test hook: drop every cached basis. */
export function clearBasisCache(): void {
  basisCache.clear();
}

export interface BasisFetch {
  basis: Basis;
  /** served from the isolate cache without a replica call */
  hit: boolean;
  /** why the replica was called: "off" (cache disabled), "miss", "expired", "min-t" */
  reason: "hit" | "off" | "miss" | "expired" | "min-t";
  /** replica calls made (0 on a hit; >1 only when polling for min-t) */
  calls: number;
  /** min-t requested but the replica never reached it within the retry window */
  behind: boolean;
}

/** Fetch a basis for `db`: isolate cache (per knobs) or the nearest replica's GET /basis. */
export async function fetchBasisWithStats(env: RippleEnv, db: string, request: Request): Promise<BasisFetch> {
  const useCache = wantsBasisCache(request, env);
  const mode = cacheModeOf(request, env);
  const minT = minTOf(request);
  const key = `${db}|${hintOf(request, env) ?? ""}`;
  let reason: BasisFetch["reason"] = "off";
  if (useCache) {
    const hit = basisCache.get(key);
    const ttl = mode === "peer" ? BASIS_SAFETY_TTL_MS : BASIS_TTL_MS;
    if (!hit) reason = "miss";
    else if (Date.now() - hit.at >= ttl) reason = "expired";
    else if (minT !== undefined && hit.basis.t < minT) reason = "min-t";
    else return { basis: hit.basis, hit: true, reason: "hit", calls: 0, behind: false };
  }
  const stub = nearestReplica(env, db, request);
  let calls = 0;
  let basis: Basis;
  for (;;) {
    calls++;
    const res = await stub.fetch(`https://replica/basis?db=${encodeURIComponent(db)}`, { headers: coloHeader(request) });
    if (!res.ok) throw new Error(`replica basis failed: ${res.status} ${await res.text()}`);
    basis = (await res.json()) as Basis;
    if (minT === undefined || basis.t >= minT || calls > MIN_T_RETRIES) break;
    await new Promise((r) => setTimeout(r, MIN_T_RETRY_MS));
  }
  const behind = minT !== undefined && basis.t < minT;
  if (useCache) {
    // never overwrite a newer entry (a concurrent refetch or a min-t poll may have raced us)
    const cur = basisCache.get(key);
    if (!cur || cur.basis.t <= basis.t) basisCache.set(key, { basis, at: Date.now() });
  }
  return { basis, hit: false, reason, calls, behind };
}

export async function fetchBasis(env: RippleEnv, db: string, request: Request): Promise<Basis> {
  return (await fetchBasisWithStats(env, db, request)).basis;
}

/** Diagnostic response headers describing how the basis was obtained. */
export function basisHeaders(request: Request, env: RippleEnv, f: BasisFetch): Record<string, string> {
  return {
    "x-ripple-basis-t": String(f.basis.t),
    "x-ripple-basis-hit": f.hit ? "1" : "0",
    "x-ripple-basis-reason": f.reason,
    "x-ripple-basis-calls": String(f.calls),
    ...(f.behind ? { "x-ripple-basis-behind": "1" } : {}),
    "x-ripple-replica-hint": hintOf(request, env) ?? "",
    "x-ripple-cache-basis": wantsBasisCache(request, env) ? "1" : "0",
    "x-ripple-cache-mode": cacheModeOf(request, env),
    "x-ripple-colo": String((request as any).cf?.colo ?? ""),
  };
}

export function hintFor(continent: string): string | undefined {
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
