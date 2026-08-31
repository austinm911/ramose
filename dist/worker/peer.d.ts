import { R2NodeStore } from "../internal/storage/index.ts";
import { type RamoseEnv } from "../internal/transactor/index.ts";
import type { Basis } from "../internal/replica/index.ts";
import type { LiveBasisEvent } from "../internal/authorization/live.ts";
import { Unauthorized } from "../db/Errors.ts";
import * as Stream from "effect/Stream";
export declare function segmentSource(env: RamoseEnv, db: string): R2NodeStore;
export declare function clearSegmentSources(): void;
export declare function replicaId(env: RamoseEnv, db: string, region: string, shards?: number, hint?: string | undefined): DurableObjectId;
export declare function regionOf(request: Request): string;
export type CacheMode = "ttl" | "peer";
export declare function coloHint(colo: string | undefined): string | undefined;
export declare function hintOf(request: Request, env?: Pick<RamoseEnv, "RAMOSE_REPLICA_HINT">): string | undefined;
export declare function coloOf(request: Request): string;
export declare function coloHeader(request: Request): Record<string, string>;
export declare function nearestReplica(env: RamoseEnv, db: string, request: Request, trustedHint?: string): DurableObjectStub;
export declare const watchBasisChanges: (env: RamoseEnv, db: string, request: Request) => {
    readonly changes: Stream.Stream<LiveBasisEvent, Unauthorized>;
    readonly currentBasis: () => Basis | undefined;
    readonly failed: Promise<void>;
};
export type ReplicationRevisionRecord = {
    readonly revision: string;
    readonly binding: string;
    readonly basisT: number;
    readonly keyId: string;
};
export declare const replicationRevisionStoreId: (env: Pick<RamoseEnv, "REPLICA">, database: string, binding: string) => DurableObjectId;
export declare const rememberReplicationRevision: (env: RamoseEnv, database: string, record: ReplicationRevisionRecord) => Promise<void>;
export declare const resolveReplicationRevision: (env: RamoseEnv, database: string, revision: string, binding: string, keyId: string) => Promise<number | undefined>;
export declare function wantsBasisCache(_request: Request, env?: Pick<RamoseEnv, "RAMOSE_CACHE_BASIS">): boolean;
export declare function cacheModeOf(_request: Request, env?: Pick<RamoseEnv, "RAMOSE_CACHE_MODE">): CacheMode;
export declare const BASIS_TTL_MS = 5000;
export declare const BASIS_SAFETY_TTL_MS: number;
export type BasisCacheReason = "hit" | "off" | "miss" | "expired" | "min-t";
export declare const basisCacheDecision: (useCache: boolean, mode: CacheMode, now: number, cached: {
    readonly t: number;
    readonly at: number;
} | undefined, minT: number | undefined) => BasisCacheReason;
export declare const shouldReplaceCachedBasis: (cachedT: number | undefined, fetchedT: number) => boolean;
export declare function invalidateBasis(db: string): void;
export declare function clearBasisCache(): void;
export interface BasisFetch {
    basis: Basis;
    hit: boolean;
    reason: BasisCacheReason;
    calls: number;
    behind: boolean;
}
export interface BasisFetchOptions {
    readonly bypassCache?: boolean;
    readonly authoritativeFence?: boolean;
    readonly minimumBasis?: number | undefined;
    readonly useCache?: boolean | undefined;
    readonly cacheMode?: CacheMode | undefined;
    readonly replicaHint?: string | undefined;
}
export declare const basisCacheEnabled: (request: Request, env?: Pick<RamoseEnv, "RAMOSE_CACHE_BASIS">, options?: BasisFetchOptions) => boolean;
export declare const effectiveBasisMinT: (clientMinT: number | undefined, transactorT: number | undefined) => number | undefined;
export declare function fetchBasisWithStats(env: RamoseEnv, db: string, request: Request, options?: BasisFetchOptions): Promise<BasisFetch>;
export declare function fetchBasis(env: RamoseEnv, db: string, request: Request, options?: BasisFetchOptions): Promise<Basis>;
export declare function basisHeaders(request: Request, env: RamoseEnv, f: BasisFetch, options?: BasisFetchOptions): Record<string, string>;
export declare function hintFor(continent: string): string | undefined;
//# sourceMappingURL=peer.d.ts.map