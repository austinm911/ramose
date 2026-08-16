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

const HINTS = new Set(["wnam", "enam", "sam", "weur", "eeur", "apac", "oc", "afr", "me"]);

/** Location hint for a request: `x-ripple-replica-hint` header if valid, else the continent default. */
export function hintOf(request: Request): string | undefined {
  const h = request.headers.get("x-ripple-replica-hint");
  return h && HINTS.has(h) ? h : hintFor(regionOf(request));
}

/** Nearest replica stub for a request (deterministic id + location hint). */
export function nearestReplica(env: RippleEnv, db: string, request: Request): DurableObjectStub {
  const region = regionOf(request);
  const hint = hintOf(request);
  return env.REPLICA.get(replicaId(env, db, region, 1, hint), { locationHint: hint } as any);
}

/** Response headers a forwarded read copies from the replica onto the public response. */
export const READ_PASSTHROUGH_HEADERS = ["x-ripple-r2-gets", "x-ripple-cache-hits", "x-ripple-basis-t"] as const;

/**
 * Execute a read (datalog / pull / entity) on the nearest QueryReplica and hand
 * its response back verbatim (status + body + x-ripple-* stats). The Worker no
 * longer fetches a basis and runs datalog itself; `x-ripple-ms` is the Worker's
 * wall time for the forwarded call.
 */
export async function readFromReplica(env: RippleEnv, db: string, request: Request, body: string, t0: number): Promise<Response> {
  const res = await nearestReplica(env, db, request).fetch(`https://replica/query?db=${encodeURIComponent(db)}`, { method: "POST", body, headers: { "content-type": "application/json" } });
  const headers: Record<string, string> = { "content-type": "application/json", "access-control-allow-origin": "*", "x-ripple-ms": String(Date.now() - t0) };
  for (const h of READ_PASSTHROUGH_HEADERS) {
    const v = res.headers.get(h);
    if (v !== null) headers[h] = v;
  }
  return new Response(res.body, { status: res.status, headers });
}

// ---- isolate basis cache (opt-in per request via x-ripple-cache-basis: 1) ----
// Keyed by db|hint. Reused until a write through this Worker (invalidateBasis) or the
// entry ages past BASIS_TTL_MS; other Workers' writes are only seen after that TTL.
const basisCache = new Map<string, { basis: Basis; at: number }>();
const BASIS_TTL_MS = 5_000;

export function invalidateBasis(db: string): void {
  for (const k of basisCache.keys()) if (k.startsWith(`${db}|`)) basisCache.delete(k);
}

export function wantsBasisCache(request: Request): boolean {
  return request.headers.get("x-ripple-cache-basis") === "1";
}

export async function fetchBasis(env: RippleEnv, db: string, request: Request): Promise<Basis> {
  const useCache = wantsBasisCache(request);
  const key = `${db}|${hintOf(request) ?? ""}`;
  if (useCache) {
    const hit = basisCache.get(key);
    if (hit && Date.now() - hit.at < BASIS_TTL_MS) return hit.basis;
  }
  const stub = nearestReplica(env, db, request);
  const res = await stub.fetch(`https://replica/basis?db=${encodeURIComponent(db)}`);
  if (!res.ok) throw new Error(`replica basis failed: ${res.status} ${await res.text()}`);
  const basis = (await res.json()) as Basis;
  if (useCache) basisCache.set(key, { basis, at: Date.now() });
  return basis;
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
