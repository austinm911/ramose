import * as Effect from "effect/Effect";
import { type Tempid } from "./entityArg.ts";
import type { AnyEntity } from "./Entity.ts";
import type { AnyField, CreationDefault, ValueOf } from "./Field.ts";
import type { AnySchema } from "./Schema.ts";
import type { AttrAtIdent, CatalogIdent, EntityRef, LookupRef, RefWriteValue, RefWriteTarget, UnbrandedId, ValueAtIdent, WriteAtEntity, IdentOfFieldIn } from "./idents.ts";
type CatalogField<C extends AnySchema> = {
    [N in keyof C["entities"]]: C["entities"][N]["fields"][keyof C["entities"][N]["fields"]];
}[keyof C["entities"]];
type FixedCatalogIdent<C extends AnySchema> = CatalogField<C> extends infer F ? F extends {
    readonly fixed: true;
    readonly ident: infer I extends string;
} ? I : never : never;
type WritableCatalogIdent<C extends AnySchema> = Exclude<CatalogIdent<C>, FixedCatalogIdent<C>>;
export type TxField<C extends AnySchema> = {
    readonly ident: WritableCatalogIdent<C>;
} | WritableCatalogIdent<C>;
type IdentOfTxField<C extends AnySchema, A> = A extends {
    readonly ident: infer I extends string;
} ? I : A extends CatalogIdent<C> ? A : never;
export type TxValue<C extends AnySchema, A, H = TxHandle<C>> = IdentOfTxField<C, A> extends infer I ? [I] extends [never] ? never : I extends string ? AttrAtIdent<C, I>["valueType"] extends "ref" ? RefWriteValue<C, I, H> : ValueAtIdent<C, I> : never : never;
export type FieldRefLookup<C extends AnySchema> = {
    [I in CatalogIdent<C>]: readonly [
        {
            readonly ident: I;
        },
        ValueAtIdent<C, I>
    ];
}[CatalogIdent<C>];
export type TxEntity<C extends AnySchema> = EntityRef<C, C["entities"][keyof C["entities"]] & AnyEntity, TxHandle<C>>;
export type TxKnownEntity<C extends AnySchema> = string extends keyof C["entities"] ? AnyEntity : C["entities"][keyof C["entities"]];
type RefSlotTarget<C extends AnySchema, N extends AnyEntity, K extends string> = RefWriteTarget<C, IdentOfFieldIn<N["fields"][K], N["ns"], K>>;
type PutRef<C extends AnySchema, H = TxHandle<C>, Target extends AnyEntity = AnyEntity> = EntityRef<C, Target, H> | {
    readonly eid: number | null;
    readonly class: string;
};
type PutScalar<C extends AnySchema, N extends AnyEntity, K extends string, H = TxHandle<C>> = (N["fields"][K] extends {
    readonly valueType: "ref";
} ? PutRef<C, H, RefSlotTarget<C, N, K>> : ValueAtIdent<C, IdentOfFieldIn<N["fields"][K], N["ns"], K>>);
type PutFieldValue<C extends AnySchema, N extends AnyEntity, K extends string, H = TxHandle<C>> = N["fields"][K] extends {
    readonly valueType: "ref";
} ? N["fields"][K]["cardinality"] extends "many" ? ReadonlyArray<PutScalar<C, N, K, H>> : PutScalar<C, N, K, H> : WriteAtEntity<C, N>[K];
type FixedPutAttrs<N extends AnyEntity> = {
    [K in keyof N["fields"] & string as N["fields"][K] extends {
        readonly fixed: true;
    } ? K : never]?: never;
};
export type PutAttrs<C extends AnySchema, N extends AnyEntity, H = TxHandle<C>> = {
    [K in keyof WriteAtEntity<C, N> & string as N["fields"][K] extends {
        readonly fixed: true;
    } ? never : K]?: PutFieldValue<C, N, K, H> | undefined;
} & FixedPutAttrs<N>;
type FieldIsOptional<F> = F extends {
    readonly cardinality: "many";
} ? true : F extends {
    readonly isOptional: true;
} ? true : F extends {
    readonly default: CreationDefault<unknown>;
} ? true : F extends {
    readonly compositionDefault: true;
} ? true : undefined extends ValueOf<F extends AnyField ? F : never> ? true : false;
type PublicPutKeys<N extends AnyEntity> = {
    [K in keyof N["fields"] & string]: N["fields"][K] extends {
        readonly fixed: true;
    } ? never : K;
}[keyof N["fields"] & string];
type RequiredPutKeys<N extends AnyEntity> = {
    [K in keyof N["fields"] & string]: N["fields"][K] extends {
        readonly fixed: true;
    } ? never : FieldIsOptional<N["fields"][K]> extends true ? never : K;
}[keyof N["fields"] & string];
type OptionalPutKeys<N extends AnyEntity> = Exclude<PublicPutKeys<N>, RequiredPutKeys<N>>;
export type PutCreateAttrs<C extends AnySchema, N extends AnyEntity, H = TxHandle<C>> = {
    [K in RequiredPutKeys<N>]: PutFieldValue<C, N, K, H>;
} & {
    [K in OptionalPutKeys<N>]?: PutFieldValue<C, N, K, H> | undefined;
} & FixedPutAttrs<N>;
type UpsertKeys<N extends AnyEntity> = {
    [K in keyof N["fields"] & string]: N["fields"][K] extends {
        readonly fixed: true;
    } ? never : N["fields"][K] extends {
        readonly unique: "upsert";
    } ? K : never;
}[keyof N["fields"] & string];
type RequireAtLeastOne<T, Keys extends keyof T> = {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Omit<T, K>>;
}[Keys];
export type UpdateMapAttrs<C extends AnySchema, N extends AnyEntity, H = TxHandle<C>> = [UpsertKeys<N>] extends [never] ? {
    readonly "update map form needs a unique: \"upsert\" field": never;
} : RequireAtLeastOne<PutAttrs<C, N, H>, UpsertKeys<N> & keyof PutAttrs<C, N, H>>;
export type PutSubject<C extends AnySchema, N extends AnyEntity, H = TxHandle<C>> = EntityRef<C, N, H>;
export type TxMap = Readonly<Record<string, unknown>>;
export type TxOp = readonly [":db/add", unknown, string, unknown] | readonly [":db/update", unknown, string, unknown] | readonly [":db/update", unknown] | readonly [":db/retract", unknown, string] | readonly [":db/retract", unknown, string, unknown] | readonly [":db/retractEntity", unknown] | TxMap;
export interface TxSpec {
    readonly ops: readonly TxOp[];
}
export declare const TX_INTERNALS: unique symbol;
export interface TxInternals<C extends AnySchema = AnySchema> {
    readonly schema: C;
    readonly ops: () => readonly TxOp[];
}
export declare const txOps: (tx: object) => readonly TxOp[];
export declare const txSchema: <C extends AnySchema>(tx: Tx<C>) => C;
export interface TxHandle<C extends AnySchema = AnySchema> {
    readonly _tag: "TxHandle";
    readonly eid: UnbrandedId | Tempid | LookupRef<C>;
    set<const A extends TxField<C>>(field: A, value: TxValue<C, A, TxHandle<C>>): Effect.Effect<void>;
    remove<const A extends TxField<C>>(field: A, value?: TxValue<C, A, TxHandle<C>>): Effect.Effect<void>;
    readonly delete: Effect.Effect<void>;
}
export interface Tx<C extends AnySchema = AnySchema> {
    entity(): Effect.Effect<TxHandle<C>>;
    entity(id: TxEntity<C>): Effect.Effect<TxHandle<C>>;
    tempid(name: string): Tempid;
    set<const A extends TxField<C>>(e: TxEntity<C>, field: A, value: TxValue<C, A, TxHandle<C>>): Effect.Effect<void>;
    remove<const A extends TxField<C>>(e: TxEntity<C>, field: A, value?: TxValue<C, A, TxHandle<C>>): Effect.Effect<void>;
    delete(e: TxEntity<C>): Effect.Effect<void>;
    put<N extends TxKnownEntity<C>>(entity: N, attrs: PutCreateAttrs<C, N>): Effect.Effect<TxHandle<C>>;
    put<N extends TxKnownEntity<C>>(entity: N, id: PutSubject<C, N>, attrs: PutAttrs<C, N>): Effect.Effect<TxHandle<C>>;
    update<N extends TxKnownEntity<C>>(entity: N, attrs: UpdateMapAttrs<C, N>): Effect.Effect<TxHandle<C>>;
    update<N extends TxKnownEntity<C>>(entity: N, id: PutSubject<C, N>, attrs: PutAttrs<C, N>): Effect.Effect<TxHandle<C>>;
}
export type YieldError<Eff> = [Eff] extends [never] ? never : [Eff] extends [Effect.Effect<infer _A, infer E, infer _R>] ? E : never;
export type YieldContext<Eff> = [Eff] extends [never] ? never : [Eff] extends [Effect.Effect<infer _A, infer _E, infer R>] ? R : never;
export declare const isTxHandle: (e: unknown) => e is TxHandle;
export declare const txBuilder: <C extends AnySchema>(schema: C) => Tx<C>;
export {};
//# sourceMappingURL=Tx.d.ts.map