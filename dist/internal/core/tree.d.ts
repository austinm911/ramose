/**
 * Immutable segment trees.
 *
 * A tree for one index is a B+-tree–like structure of content-addressed
 * nodes:
 *   - Leaf: a segment (sorted datoms) — stored as `seg/<sha256>`
 *   - Dir:  sorted array of (firstKey, childRef) — stored as `n/<sha256>`
 *
 * Nodes are fetched through a `NodeSource` (memory → edge cache → R2 in the
 * peer; a plain Map in tests). `peek` is the synchronous hot path — a warm
 * seek never awaits — and `load` is the async miss path.
 *
 * Operations:
 *   - buildTree(store, index, sortedDatoms)         bulk load
 *   - scan(src, index, root, prefix)                 ordered chunks matching a prefix
 *   - seekOne(...)                                   first datom matching a prefix
 *   - estimateCount(...)                             cheap cardinality estimate (planner)
 *   - mergeTree(store, index, root, sortedNovelty)   structural-sharing merge (indexer)
 *
 * Trees keep *all* datoms, asserts and retracts, forever (until GC of old
 * roots). "Current" state is derived at read time by collapsing each
 * (e,a,v) group to its latest datom — see `novelty.ts#currentView`.
 */
import { type Datom, type DatomComparator, type IndexId, type Prefix } from "./datom.ts";
export declare const NodeKind: {
    readonly Leaf: 0;
    readonly Dir: 1;
};
export type NodeKind = (typeof NodeKind)[keyof typeof NodeKind];
export interface NodeRef {
    /** hex sha-256 of the stored object body */
    readonly hash: string;
    readonly kind: NodeKind;
    /** number of datoms in the subtree */
    readonly count: number;
}
export interface LeafNode {
    readonly kind: 0;
    readonly datoms: readonly Datom[];
}
export interface DirNode {
    readonly kind: 1;
    /** keys[i] = first datom of child i's subtree */
    readonly keys: readonly Datom[];
    readonly refs: readonly NodeRef[];
}
export type TreeNode = LeafNode | DirNode;
export interface NodeSource {
    /** Synchronous cache lookup. Must be cheap. */
    peek(hash: string): TreeNode | undefined;
    /** Async fetch (and usually populate the cache). */
    load(ref: NodeRef): Promise<TreeNode>;
}
export interface NodeStore extends NodeSource {
    /** Persist a node; returns its content-addressed ref. */
    put(index: IndexId, node: TreeNode): Promise<NodeRef>;
}
export interface BuildOptions {
    /** target datoms per leaf (default 3000) */
    leafSize?: number;
    /** target children per directory node (default 1024) */
    fanout?: number;
}
export declare function encodeNode(index: IndexId, node: TreeNode): Uint8Array;
export declare function decodeNode(buf: Uint8Array): {
    index: IndexId;
    node: TreeNode;
};
/** First index i in [0,n) with comparePrefix(datoms[i], p) >= 0, else n. */
export declare function lowerBound(index: IndexId, datoms: readonly Datom[], p: Prefix): number;
/** First index i in [0,n) with comparePrefix(datoms[i], p) > 0, else n. */
export declare function upperBound(index: IndexId, datoms: readonly Datom[], p: Prefix): number;
export type PrefixCmp = (d: Datom, p: Prefix) => number;
/**
 * A comparator specialised to the *shape* of `p` (which components are
 * bound) in `index` order — same result as `comparePrefix`, without the
 * per-call dispatch. Only valid for prefixes of the same shape as `p`.
 */
export declare function prefixComparator(index: IndexId, p: Prefix): PrefixCmp;
/** lowerBound restricted to [from, n): gallops forward, then bisects. */
export declare function lowerBoundFrom(cmp: PrefixCmp, datoms: readonly Datom[], p: Prefix, from: number): number;
/** upperBound restricted to [from, n): gallops forward, then bisects. */
export declare function upperBoundFrom(cmp: PrefixCmp, datoms: readonly Datom[], p: Prefix, from: number): number;
/** First index i with cmp(datoms[i], d) >= 0 (full-key lower bound). */
export declare function lowerBoundDatom(cmp: DatomComparator, datoms: readonly Datom[], d: Datom): number;
export interface Chunk {
    readonly datoms: readonly Datom[];
    readonly start: number;
    /** exclusive */
    readonly end: number;
}
/**
 * Yield ordered chunks (leaf slices) of all datoms matching `prefix`.
 * Warm path (all nodes in `peek`) never awaits on a pending promise.
 */
export declare function scan(src: NodeSource, index: IndexId, root: NodeRef, prefix: Prefix): AsyncGenerator<Chunk, void, undefined>;
/**
 * Batched seek: for a list of *same-shape* prefixes (identical set of bound
 * components — hence equal or disjoint ranges; duplicates allowed) return
 * `results[i]` = the datoms matching `prefixes[i]`. One cursor walks the
 * tree in ascending prefix order; consecutive prefixes that land in the resident leaf cost only a
 * binary search, and no async machinery is spun up per prefix. Warm path
 * never awaits a pending promise.
 */
export declare function scanMany(src: NodeSource, index: IndexId, root: NodeRef, prefixes: readonly Prefix[]): Promise<Datom[][]>;
/** First datom matching the prefix, or undefined. */
export declare function seekOne(src: NodeSource, index: IndexId, root: NodeRef, prefix: Prefix): Promise<Datom | undefined>;
/** Collect all datoms matching a prefix into an array. */
export declare function collect(src: NodeSource, index: IndexId, root: NodeRef, prefix: Prefix): Promise<Datom[]>;
/**
 * Estimate how many datoms match `prefix` — visits at most two root-to-leaf
 * paths. Exact when both boundary leaves are resident; otherwise a bound.
 */
export declare function estimateCount(src: NodeSource, index: IndexId, root: NodeRef, prefix: Prefix): Promise<number>;
/**
 * Bulk-build a tree from datoms sorted in the index order (duplicates
 * removed). Returns the root ref. An empty input yields an empty leaf root.
 */
export declare function buildTree(store: NodeStore, index: IndexId, sorted: readonly Datom[], opts?: BuildOptions): Promise<NodeRef>;
/** Sorted union with dedup of identical datoms. */
export declare function sortedUnion(cmp: DatomComparator, a: readonly Datom[], b: readonly Datom[]): Datom[];
/**
 * Merge `novelty` (sorted in index order, deduped) into the tree at `root`
 * writing only the touched leaves and their ancestors (O(Δ · depth) new
 * objects). Returns the new root (== `root` if nothing changed).
 */
export declare function mergeTree(store: NodeStore, index: IndexId, root: NodeRef, novelty: readonly Datom[], opts?: BuildOptions): Promise<NodeRef>;
/** Depth of a tree (1 = single leaf). Loads one path. */
export declare function treeDepth(src: NodeSource, root: NodeRef): Promise<number>;
/** Collect every node hash reachable from `root` (for GC marking). */
export declare function reachable(src: NodeSource, root: NodeRef, into?: Set<string>): Promise<Set<string>>;
//# sourceMappingURL=tree.d.ts.map