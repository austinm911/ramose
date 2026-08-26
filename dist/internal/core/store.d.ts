/**
 * Node stores. `MemStore` is the pure in-memory, content-addressed store used
 * by tests, benches and the in-memory `Connection`. It performs the same
 * encode → compress → sha256 pipeline the R2 store uses, so hashes are
 * identical across backends and structural-sharing tests can count objects.
 *
 * `Codec` abstracts compression (gzip via CompressionStream by default;
 * `identity` for speed in tests). Open decision §8: gzip vs zstd — gzip is
 * built in everywhere; zstd can be slotted in as another Codec later.
 */
import type { IndexId } from "./datom.ts";
import { type NodeKind, type NodeRef, type NodeSource, type NodeStore, type TreeNode } from "./tree.ts";
export interface Codec {
    readonly name: string;
    compress(data: Uint8Array): Promise<Uint8Array>;
    decompress(data: Uint8Array): Promise<Uint8Array>;
}
export declare const identityCodec: Codec;
export declare const gzipCodec: Codec;
/** Object key prefix per node kind (R2 layout: seg/<hash>, n/<hash>). */
export declare function objectKey(kind: NodeKind, hash: string): string;
/** Encode + compress + hash a node. Shared by every store implementation. */
export declare function serializeNode(index: IndexId, node: TreeNode, codec: Codec): Promise<{
    ref: NodeRef;
    body: Uint8Array;
}>;
export declare function deserializeNode(body: Uint8Array, codec: Codec): Promise<TreeNode>;
export interface MemStoreStats {
    puts: number;
    /** distinct objects actually stored (dedup by hash) */
    objects: number;
    loads: number;
    bytes: number;
}
export declare class MemStore implements NodeStore {
    readonly codec: Codec;
    private readonly keepDecoded;
    readonly nodes: Map<string, TreeNode>;
    readonly bodies: Map<string, Uint8Array<ArrayBufferLike>>;
    readonly stats: MemStoreStats;
    constructor(codec?: Codec, keepDecoded?: boolean);
    peek(hash: string): TreeNode | undefined;
    load(ref: NodeRef): Promise<TreeNode>;
    put(index: IndexId, node: TreeNode): Promise<NodeRef>;
    /** Forget decoded nodes (forces `load` on next access — for cold-path tests). */
    evictDecoded(): void;
    /** Delete every object not in `keep` (GC sweep). Returns number deleted. */
    sweep(keep: Set<string>): number;
}
/**
 * A NodeSource that layers a memory cache in front of another source
 * (peer-side: mem → Cache API → R2). LRU by insertion order, bounded by node
 * count. `NodeStore` puts pass through to the backing store.
 */
export declare class CachingSource implements NodeStore {
    private readonly backing;
    private readonly maxNodes;
    private readonly cache;
    hits: number;
    misses: number;
    constructor(backing: NodeSource | NodeStore, maxNodes?: number);
    peek(hash: string): TreeNode | undefined;
    load(ref: NodeRef): Promise<TreeNode>;
    put(index: IndexId, node: TreeNode): Promise<NodeRef>;
    private remember;
}
//# sourceMappingURL=store.d.ts.map