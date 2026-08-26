/**
 * Schema: attributes are entities described by datoms (Datomic-inspired):
 *   :db/ident        string   — the attribute's name, e.g. ":user/email"
 *   :db/valueType    string   — ":db.type/string" | long | double | boolean | ref | uuid | instant | bytes
 *   :db/cardinality  string   — ":db.cardinality/one" | ":db.cardinality/many"
 *   :db/unique       string   — ":db.unique/identity" | ":db.unique/value"   (implies AVET)
 *   :db/index        boolean  — AVET membership
 *   :db/isComponent  boolean
 *   :db/doc          string
 *
 * `Schema` is an immutable-ish projection of those datoms that the engine
 * consults for interning, typing, and index membership (AVET for indexed /
 * unique attrs, VAET for refs — never index everything).
 */
import { type Datom, type ValueTag as VT } from "./datom.ts";
export declare const DB_IDENT = 10;
export declare const DB_VALUE_TYPE = 40;
export declare const DB_CARDINALITY = 41;
export declare const DB_UNIQUE = 42;
export declare const DB_IS_COMPONENT = 43;
export declare const DB_INDEX = 44;
export declare const DB_OPTIONAL = 45;
export declare const DB_TX_INSTANT = 50;
export declare const DB_DOC = 62;
/** First entity id handed out to user entities. */
export declare const FIRST_USER_EID = 1000;
/** Tx entities live in their own id partition: e = TX_BASE + t. */
export declare const TX_BASE: number;
export declare function txEid(t: number): number;
export declare function isTxEid(e: number): boolean;
export declare function tOfTxEid(e: number): number;
export type Cardinality = "one" | "many";
export type Uniqueness = "identity" | "value";
export interface Attribute {
    readonly id: number;
    readonly ident: string;
    readonly valueType: VT;
    readonly cardinality: Cardinality;
    readonly unique?: Uniqueness;
    readonly index: boolean;
    readonly isComponent: boolean;
    readonly doc?: string;
    /** Card-one field the schema marked optional — not required at create. */
    readonly optional?: boolean;
}
export declare const VALUE_TYPE_IDENTS: Record<string, VT>;
export declare const VALUE_TYPE_NAMES: Record<number, string>;
/** Attribute schema as a plain object (input form for `schemaTx`). */
export interface AttributeSpec {
    ident: string;
    valueType: keyof typeof VALUE_TYPE_IDENTS | VT;
    cardinality?: Cardinality;
    unique?: Uniqueness;
    index?: boolean;
    isComponent?: boolean;
    optional?: boolean;
    doc?: string;
}
/** Datoms describing an attribute entity `e` per `spec`, at tx `t`. */
export declare function attributeDatoms(e: number, spec: AttributeSpec, t: number): Datom[];
/** The bootstrap transaction (t = 1): system attributes describing themselves. */
export declare function bootstrapDatoms(): Datom[];
export declare class Schema {
    private readonly byId;
    private readonly byIdent;
    /** every :db/ident (attributes and plain ident entities) → eid */
    private readonly idents;
    private readonly identOf;
    private readonly partials;
    static bootstrap(): Schema;
    clone(): Schema;
    /** Apply schema-relevant datoms (others are ignored). Mutates and returns this. */
    apply(datoms: readonly Datom[]): this;
    private rebuild;
    attr(idOrIdent: number | string): Attribute | undefined;
    requireAttr(idOrIdent: number | string): Attribute;
    /** Resolve an ident (attribute or plain ident entity) to its entity id. */
    entid(ident: string): number | undefined;
    ident(e: number): string | undefined;
    attributes(): Attribute[];
    /** Should datoms of attribute `a` be in AVET? (indexed or unique) */
    isAvet(a: number): boolean;
    /** Should datoms of attribute `a` be in VAET? (refs) */
    isVaet(a: number): boolean;
}
//# sourceMappingURL=schema.d.ts.map