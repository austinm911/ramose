/**
 * Peer-side segment source and basis fetching.
 *
 * SegmentSource = R2NodeStore(memory LRU → Cache API → R2). One instance per
 * database per isolate (module scope) so warm isolates serve repeat queries
 * with zero R2 reads. R2 keys are namespaced per database (db/<name>/…);
 * the Cache API tier is keyed by content hash and shared.
 */
import { R2NodeStore } from "../internal/storage/index.ts";
import { type RamoseEnv } from "../internal/transactor/index.ts";
import type { Basis } from "../internal/replica/index.ts";
export declare function segmentSource(env: RamoseEnv, db: string): R2NodeStore;
/** Test hook: drop every cached segment source. */
export declare function clearSegmentSources(): void;
/** Deterministic replica choice: hash(db, region) → one of `shards` replicas per region.
 *  The location hint is part of the id, so switching hints (e.g. wnam → enam) creates a
 *  fresh DO placed near the new hint instead of reusing one placed elsewhere. */
export declare function replicaId(env: RamoseEnv, db: string, region: string, shards?: number, hint?: string | undefined): DurableObjectId;
/** Nearest region key for a request (Cloudflare colo continent, falls back to "global"). */
export declare function regionOf(request: Request): string;
export type CacheMode = "ttl" | "peer";
/** colo → hint (undefined when unknown). */
export declare function coloHint(colo: string | undefined): string | undefined;
/** Location hint for a request. Header wins, then env RAMOSE_REPLICA_HINT, then the continent default.
 *  `auto` (header or env) resolves colo→hint and falls back to the continent when the colo is unknown. */
export declare function hintOf(request: Request, env?: Pick<RamoseEnv, "RAMOSE_REPLICA_HINT">): string | undefined;
/**
 * Colo of the inbound edge request. Worker→DO subrequests carry no `request.cf`,
 * so the DO can only learn its caller's colo if we forward it as a header.
 */
export declare function coloOf(request: Request): string;
export declare function coloHeader(request: Request): Record<string, string>;
/** Nearest replica stub for a request (deterministic id + location hint). */
export declare function nearestReplica(env: RamoseEnv, db: string, request: Request): DurableObjectStub;
export declare function wantsBasisCache(request: Request, env?: Pick<RamoseEnv, "RAMOSE_CACHE_BASIS">): boolean;
export declare function cacheModeOf(request: Request, env?: Pick<RamoseEnv, "RAMOSE_CACHE_MODE">): CacheMode;
/** `x-ramose-min-t` (client's last seen t), or undefined. */
export declare function minTOf(request: Request): number | undefined;
export declare const BASIS_TTL_MS = 5000;
export declare const BASIS_SAFETY_TTL_MS: number;
export declare function invalidateBasis(db: string): void;
/** Test hook: drop every cached basis. */
export declare function clearBasisCache(): void;
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
export declare function fetchBasisWithStats(env: RamoseEnv, db: string, request: Request): Promise<BasisFetch>;
export declare function fetchBasis(env: RamoseEnv, db: string, request: Request): Promise<Basis>;
/** Diagnostic response headers describing how the basis was obtained. */
export declare function basisHeaders(request: Request, env: RamoseEnv, f: BasisFetch): Record<string, string>;
export declare function hintFor(continent: string): string | undefined;
//# sourceMappingURL=peer.d.ts.map