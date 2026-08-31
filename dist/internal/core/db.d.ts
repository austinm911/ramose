import { type Datom, type IndexId, type Prefix, type TaggedValue, ValueTag } from "./datom.ts";
import { Novelty } from "./novelty.ts";
import { type Attribute, Schema } from "./schema.ts";
import { type NodeRef, type NodeSource } from "./tree.ts";
import type { CompositionIndex } from "./composition.ts";
export interface Roots {
    readonly t: number;
    readonly eavt: NodeRef;
    readonly aevt: NodeRef;
    readonly avet: NodeRef;
    readonly vaet: NodeRef;
}
export declare function rootFor(roots: Roots, index: IndexId): NodeRef;
export type EntityRef = number | string | [string, unknown];
export type DatomPredicate = (unfiltered: Db, datom: Datom) => boolean | Promise<boolean>;
export interface DbOptions {
    store: NodeSource;
    roots: Roots;
    novelty: Novelty;
    basisT: number;
    schema: Schema;
    nextEid: number;
    asOfT?: number | undefined;
    history?: boolean;
    filters?: readonly DatomPredicate[];
    composition?: CompositionIndex | undefined;
}
export declare class Db {
    readonly store: NodeSource;
    readonly roots: Roots;
    readonly novelty: Novelty;
    readonly basisT: number;
    readonly schema: Schema;
    readonly nextEid: number;
    readonly asOfT: number | undefined;
    readonly isHistory: boolean;
    readonly filters: readonly DatomPredicate[];
    readonly composition: CompositionIndex | undefined;
    constructor(o: DbOptions);
    get effectiveT(): number;
    asOf(t: number): Db;
    history(): Db;
    filter(predicate: DatomPredicate): Db;
    withComposition(composition: CompositionIndex): Db;
    private opts;
    private unfilteredView;
    private applyFilters;
    private filterChunks;
    datoms(index: IndexId, prefix: Prefix): AsyncGenerator<Datom[], void, undefined>;
    seekMany(index: IndexId, prefixes: readonly Prefix[]): Promise<Datom[][]>;
    datomsArray(index: IndexId, prefix: Prefix): Promise<Datom[]>;
    first(index: IndexId, prefix: Prefix): Promise<Datom | undefined>;
    estimate(index: IndexId, prefix: Prefix): Promise<number>;
    attr(x: number | string): Attribute | undefined;
    requireAttr(x: number | string): Attribute;
    coerce(attr: Attribute, value: unknown): TaggedValue;
    entid(ref: EntityRef): Promise<number | undefined>;
    exists(e: number): Promise<boolean>;
    entity(e: number): Promise<Record<string, unknown> | undefined>;
    identOf(e: number): Promise<string | undefined>;
    isTx(e: number): boolean;
}
export declare function coerceValue(vt: ValueTag, value: unknown): TaggedValue;
export declare function datomJsValue(d: Datom): unknown;
//# sourceMappingURL=db.d.ts.map