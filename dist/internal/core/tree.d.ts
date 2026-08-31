import { type Datom, type DatomComparator, type IndexId, type Prefix } from "./datom.ts";
export declare const NodeKind: {
    readonly Leaf: 0;
    readonly Dir: 1;
};
export type NodeKind = (typeof NodeKind)[keyof typeof NodeKind];
export interface NodeRef {
    readonly hash: string;
    readonly kind: NodeKind;
    readonly count: number;
}
export interface LeafNode {
    readonly kind: 0;
    readonly datoms: readonly Datom[];
}
export interface DirNode {
    readonly kind: 1;
    readonly keys: readonly Datom[];
    readonly refs: readonly NodeRef[];
}
export type TreeNode = LeafNode | DirNode;
export interface NodeSource {
    peek(hash: string): TreeNode | undefined;
    load(ref: NodeRef): Promise<TreeNode>;
}
export interface NodeStore extends NodeSource {
    put(index: IndexId, node: TreeNode): Promise<NodeRef>;
}
export interface BuildOptions {
    leafSize?: number;
    fanout?: number;
}
export declare function encodeNode(index: IndexId, node: TreeNode): Uint8Array;
export declare function decodeNode(buf: Uint8Array): {
    index: IndexId;
    node: TreeNode;
};
export declare function lowerBound(index: IndexId, datoms: readonly Datom[], p: Prefix): number;
export declare function upperBound(index: IndexId, datoms: readonly Datom[], p: Prefix): number;
export type PrefixCmp = (d: Datom, p: Prefix) => number;
export declare function prefixComparator(index: IndexId, p: Prefix): PrefixCmp;
export declare function lowerBoundFrom(cmp: PrefixCmp, datoms: readonly Datom[], p: Prefix, from: number): number;
export declare function upperBoundFrom(cmp: PrefixCmp, datoms: readonly Datom[], p: Prefix, from: number): number;
export declare function lowerBoundDatom(cmp: DatomComparator, datoms: readonly Datom[], d: Datom): number;
export interface Chunk {
    readonly datoms: readonly Datom[];
    readonly start: number;
    readonly end: number;
}
export declare function scan(src: NodeSource, index: IndexId, root: NodeRef, prefix: Prefix): AsyncGenerator<Chunk, void, undefined>;
export declare function scanMany(src: NodeSource, index: IndexId, root: NodeRef, prefixes: readonly Prefix[]): Promise<Datom[][]>;
export declare function seekOne(src: NodeSource, index: IndexId, root: NodeRef, prefix: Prefix): Promise<Datom | undefined>;
export declare function collect(src: NodeSource, index: IndexId, root: NodeRef, prefix: Prefix): Promise<Datom[]>;
export declare function estimateCount(src: NodeSource, index: IndexId, root: NodeRef, prefix: Prefix): Promise<number>;
export declare function buildTree(store: NodeStore, index: IndexId, sorted: readonly Datom[], opts?: BuildOptions): Promise<NodeRef>;
export declare function sortedUnion(cmp: DatomComparator, a: readonly Datom[], b: readonly Datom[]): Datom[];
export declare function mergeTree(store: NodeStore, index: IndexId, root: NodeRef, novelty: readonly Datom[], opts?: BuildOptions): Promise<NodeRef>;
export declare function treeDepth(src: NodeSource, root: NodeRef): Promise<number>;
export declare function reachable(src: NodeSource, root: NodeRef, into?: Set<string>): Promise<Set<string>>;
//# sourceMappingURL=tree.d.ts.map