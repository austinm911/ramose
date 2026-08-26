/**
 * `Db` — an immutable database value: index roots (segment trees) + novelty
 * + basis-t + schema. Reads merge tree segments with novelty and collapse
 * history into the current view (or an as-of view, or raw history).
 *
 * Snapshot isolation is by `t`: a Db never sees datoms with t > basisT, so a
 * shared, append-only novelty structure is safe to hand to many Db values.
 */
import { type Datom, type IndexId, type Prefix, type TaggedValue, ValueTag } from "./datom.ts";
import { Novelty } from "./novelty.ts";
import { type Attribute, Schema } from "./schema.ts";
import { type NodeRef, type NodeSource } from "./tree.ts";
export interface Roots {
    /** the tree contains every datom with t <= this */
    readonly t: number;
    readonly eavt: NodeRef;
    readonly aevt: NodeRef;
    readonly avet: NodeRef;
    readonly vaet: NodeRef;
}
export declare function rootFor(roots: Roots, index: IndexId): NodeRef;
/** Anything that names an entity: eid, ident, or lookup ref [attr, value]. */
export type EntityRef = number | string | [string, unknown];
export interface DbOptions {
    store: NodeSource;
    roots: Roots;
    novelty: Novelty;
    basisT: number;
    schema: Schema;
    nextEid: number;
    asOfT?: number;
    history?: boolean;
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
    constructor(o: DbOptions);
    /** Effective upper bound on visible t. */
    get effectiveT(): number;
    asOf(t: number): Db;
    history(): Db;
    private opts;
    /**
     * Ordered datoms matching `prefix` in `index`, as arrays. Current view by
     * default (asserted facts only, latest per (e,a,v)); full history when
     * `isHistory`. Always bounded by `effectiveT`.
     */
    datoms(index: IndexId, prefix: Prefix): AsyncGenerator<Datom[], void, undefined>;
    /**
     * Batched seek: `results[i]` = datoms matching `prefixes[i]` (which must
     * all bind the same components). Same visibility rules as `datoms`, but one
     * tree cursor serves the whole batch and the novelty merge / current-view
     * collapse run synchronously per prefix.
     */
    seekMany(index: IndexId, prefixes: readonly Prefix[]): Promise<Datom[][]>;
    datomsArray(index: IndexId, prefix: Prefix): Promise<Datom[]>;
    /** First datom matching prefix in current view, or undefined. */
    first(index: IndexId, prefix: Prefix): Promise<Datom | undefined>;
    /** Cheap cardinality estimate (history datoms, tree + novelty). */
    estimate(index: IndexId, prefix: Prefix): Promise<number>;
    attr(x: number | string): Attribute | undefined;
    requireAttr(x: number | string): Attribute;
    /** Coerce a JS value into a tagged value for attribute `attr`. */
    coerce(attr: Attribute, value: unknown): TaggedValue;
    /** Resolve an entity reference to an eid (undefined if it does not exist). */
    entid(ref: EntityRef): Promise<number | undefined>;
    /** Does the entity have any datoms in the current view? */
    exists(e: number): Promise<boolean>;
    /** Entity map (attribute ident → value | values). Refs stay as eids. */
    entity(e: number): Promise<Record<string, unknown> | undefined>;
    /** ident of an entity, if it has one */
    identOf(e: number): string | undefined;
    isTx(e: number): boolean;
}
/** Coerce a JS value to a tagged value of the given type (throws on mismatch). */
export declare function coerceValue(vt: ValueTag, value: unknown): TaggedValue;
/** Convert a datom's value to a JS value (Date for instants). */
export declare function datomJsValue(d: Datom): unknown;
//# sourceMappingURL=db.d.ts.map