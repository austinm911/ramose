/**
 * Novelty: datoms newer than the current index root, kept sorted in memory
 * per index, plus the merge iterator that unions a tree scan with novelty
 * and the "current view" collapse that turns the full assert/retract history
 * into present-tense facts.
 */
import { type Datom, type DatomComparator, type IndexId, type Prefix } from "./datom.ts";
import { type Chunk } from "./tree.ts";
/** One index's worth of sorted novelty. Adds are buffered; reads flush. */
export declare class SortedNovelty {
    readonly index: IndexId;
    private base;
    private pending;
    readonly cmp: DatomComparator;
    constructor(index: IndexId);
    get size(): number;
    add(datoms: readonly Datom[]): void;
    private flush;
    /** All datoms, sorted (do not mutate). */
    all(): readonly Datom[];
    /** Slice of datoms matching the prefix: [start, end) into `all()`. */
    range(prefix: Prefix): Chunk | undefined;
    /** Drop every datom with t <= maxT (after a root flip absorbed them). */
    dropThrough(maxT: number): void;
    clear(): void;
}
/** Novelty for all four indexes. */
export declare class Novelty {
    readonly byIndex: Record<IndexId, SortedNovelty>;
    private _count;
    private _maxT;
    /**
     * Add datoms. `avet(a)` / `vaet(a)` decide which attributes participate in
     * the AVET / VAET indexes (schema-driven: `:db/index`/`:db/unique` and ref-ness).
     */
    add(datoms: readonly Datom[], avet: (a: number) => boolean, vaet: (a: number) => boolean): void;
    /** Number of EAVT datoms held. */
    get count(): number;
    get maxT(): number;
    dropThrough(maxT: number): void;
    clear(): void;
}
/**
 * Merge an ordered chunk stream (from a tree scan) with a novelty chunk into
 * an ordered chunk stream. Zero-copy when novelty is empty for the range.
 */
export declare function mergeChunks(cmp: DatomComparator, tree: AsyncIterable<Chunk>, nov: Chunk | undefined): AsyncGenerator<Chunk, void, undefined>;
/**
 * Turn an ordered stream of history datoms into present-tense facts.
 * In every index order (E,A,V) are grouped contiguously with `t` last, so
 * consecutive datoms sharing (e,a,v) form the history of that fact; the last
 * one wins. Retracted facts are dropped. If `asOf` is given, datoms with
 * t > asOf are ignored first.
 *
 * Yields plain arrays (chunk boundaries do not align with groups, so the
 * collapse keeps one pending datom across chunks).
 */
export declare function currentView(chunks: AsyncIterable<Chunk>, asOf?: number): AsyncGenerator<Datom[], void, undefined>;
/**
 * Synchronous current-view collapse of one ordered datom array (same rules
 * as `currentView`). Used by batched seeks where each result is small.
 */
export declare function collapseCurrent(ds: readonly Datom[], asOf?: number): Datom[];
/** Filter chunks to t <= asOf without collapsing (history as-of). */
export declare function filterAsOf(chunks: AsyncIterable<Chunk>, asOf: number): AsyncGenerator<Datom[], void, undefined>;
/** Chunks → arrays (no filtering). */
export declare function rawView(chunks: AsyncIterable<Chunk>): AsyncGenerator<Datom[], void, undefined>;
/** Utility: does the datom match the prefix (used by tests). */
export declare function matchesPrefix(index: IndexId, d: Datom, p: Prefix): boolean;
//# sourceMappingURL=novelty.d.ts.map