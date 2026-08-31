import type { IndexId } from "./datom.ts";
import { type NodeKind, type NodeRef, type NodeSource, type NodeStore, type TreeNode } from "./tree.ts";
export interface Codec {
    readonly name: string;
    compress(data: Uint8Array): Promise<Uint8Array>;
    decompress(data: Uint8Array): Promise<Uint8Array>;
}
export declare const identityCodec: Codec;
export declare const gzipCodec: Codec;
export declare function objectKey(kind: NodeKind, hash: string): string;
export declare function serializeNode(index: IndexId, node: TreeNode, codec: Codec): Promise<{
    ref: NodeRef;
    body: Uint8Array;
}>;
export declare function deserializeNode(body: Uint8Array, codec: Codec): Promise<TreeNode>;
export interface MemStoreStats {
    puts: number;
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
    evictDecoded(): void;
    sweep(keep: Set<string>): number;
}
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