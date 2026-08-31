import { type Datom, type DatomComparator, type IndexId, type Prefix } from "./datom.ts";
import { type Chunk } from "./tree.ts";
export declare class SortedNovelty {
    readonly index: IndexId;
    private base;
    private pending;
    readonly cmp: DatomComparator;
    constructor(index: IndexId);
    get size(): number;
    add(datoms: readonly Datom[]): void;
    private flush;
    all(): readonly Datom[];
    range(prefix: Prefix): Chunk | undefined;
    dropThrough(maxT: number): void;
    clear(): void;
}
export declare class Novelty {
    readonly byIndex: Record<IndexId, SortedNovelty>;
    private _count;
    private _maxT;
    add(datoms: readonly Datom[], avet: (a: number) => boolean, vaet: (a: number) => boolean): void;
    get count(): number;
    get maxT(): number;
    dropThrough(maxT: number): void;
    clear(): void;
}
export declare function mergeChunks(cmp: DatomComparator, tree: AsyncIterable<Chunk>, nov: Chunk | undefined): AsyncGenerator<Chunk, void, undefined>;
export declare function currentView(chunks: AsyncIterable<Chunk>, asOf?: number): AsyncGenerator<Datom[], void, undefined>;
export declare function collapseCurrent(ds: readonly Datom[], asOf?: number): Datom[];
export declare function filterAsOf(chunks: AsyncIterable<Chunk>, asOf: number): AsyncGenerator<Datom[], void, undefined>;
export declare function rawView(chunks: AsyncIterable<Chunk>): AsyncGenerator<Datom[], void, undefined>;
export declare function matchesPrefix(index: IndexId, d: Datom, p: Prefix): boolean;
//# sourceMappingURL=novelty.d.ts.map