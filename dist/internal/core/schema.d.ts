import { type Datom, type ValueTag as VT } from "./datom.ts";
export declare const DB_IDENT = 10;
export declare const DB_VALUE_TYPE = 40;
export declare const DB_CARDINALITY = 41;
export declare const DB_UNIQUE = 42;
export declare const DB_IS_COMPONENT = 43;
export declare const DB_INDEX = 44;
export declare const DB_OPTIONAL = 45;
export declare const RAMOSE_TYPE = 46;
export declare const DB_TX_INSTANT = 50;
export declare const DB_DOC = 62;
export declare const RAMOSE_TYPE_IDENT = ":ramose/type";
export declare const FIRST_USER_EID = 1000;
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
    readonly unique?: Uniqueness | undefined;
    readonly index: boolean;
    readonly isComponent: boolean;
    readonly doc?: string | undefined;
    readonly optional?: boolean;
}
export declare const VALUE_TYPE_IDENTS: Record<string, VT>;
export declare const VALUE_TYPE_NAMES: Record<number, string>;
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
export declare function attributeDatoms(e: number, spec: AttributeSpec, t: number): Datom[];
export declare function bootstrapDatoms(): Datom[];
export declare class Schema {
    private readonly byId;
    private readonly byIdent;
    private readonly idents;
    private readonly identOf;
    private readonly partials;
    static bootstrap(): Schema;
    clone(): Schema;
    apply(datoms: readonly Datom[]): this;
    private rebuild;
    attr(idOrIdent: number | string): Attribute | undefined;
    requireAttr(idOrIdent: number | string): Attribute;
    entid(ident: string): number | undefined;
    ident(e: number): string | undefined;
    attributes(): Attribute[];
    isAvet(a: number): boolean;
    isVaet(a: number): boolean;
}
//# sourceMappingURL=schema.d.ts.map