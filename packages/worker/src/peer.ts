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

/** Deterministic replica choice: hash(db, region) → one of `shards` replicas per region. */
export function replicaId(env: RippleEnv, db: string, region: string, shards = 1): DurableObjectId {
  const shard = shards > 1 ? fnv1a(`${db}|${region}`) % shards : 0;
  return env.REPLICA.idFromName(`${db}|${region}|${shard}`);
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

export async function fetchBasis(env: RippleEnv, db: string, request: Request): Promise<Basis> {
  const id = replicaId(env, db, regionOf(request));
  const stub = env.REPLICA.get(id, { locationHint: hintFor(regionOf(request)) } as any);
  const res = await stub.fetch(`https://replica/basis?db=${encodeURIComponent(db)}`);
  if (!res.ok) throw new Error(`replica basis failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as Basis;
}

function hintFor(continent: string): string | undefined {
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
