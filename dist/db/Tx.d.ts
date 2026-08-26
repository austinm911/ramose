/** Schema-generic transaction builder. Internal — operation bodies see {@link Op}. */
import * as Effect from "effect/Effect";
import { type Tempid } from "./entityArg.ts";
import type { AnyEntity } from "./Entity.ts";
import type { AnyField, ValueOf } from "./Field.ts";
import type { AnySchema } from "./Schema.ts";
import type { AttrAtIdent, CatalogIdent, EntityRef, FieldTargetEntity, LookupRef, RefWriteValue, UnbrandedId, ValueAtIdent, WriteAtEntity } from "./idents.ts";
/**
 * Field slot on the builder. A field ref (`User.name`) or a schema
 * ident (`":user/name"`). Unknown idents are not in the union.
 */
export type TxField<C extends AnySchema> = {
    readonly ident: CatalogIdent<C>;
} | CatalogIdent<C>;
type IdentOfTxField<C extends AnySchema, A> = A extends {
    readonly ident: infer I extends string;
} ? I : A extends CatalogIdent<C> ? A : never;
/**
 * Value type correlated to a {@link TxField}. A ref field takes
 * {@link RefWriteValue} of its declared target — a Label eid is not an
 * `Issue.creator`. `never` when the field is unknown. `H` is the handle
 * admitted in ref slots (`TxHandle` on the builder, widened on `Op`).
 */
export type TxValue<C extends AnySchema, A, H = TxHandle<C>> = IdentOfTxField<C, A> extends infer I ? [I] extends [never] ? never : I extends string ? AttrAtIdent<C, I>["valueType"] extends "ref" ? RefWriteValue<C, I, H> : ValueAtIdent<C, I> : never : never;
/** Lookup ref written with a field ref: `[User.name, "Ada"]`. */
export type FieldRefLookup<C extends AnySchema> = {
    [I in CatalogIdent<C>]: readonly [
        {
            readonly ident: I;
        },
        ValueAtIdent<C, I>
    ];
}[CatalogIdent<C>];
export type TxEntity<C extends AnySchema> = EntityRef<C, C["entities"][keyof C["entities"]] & AnyEntity, TxHandle<C>>;
/**
 * Entity of `C` when the catalog is known; any entity against the open
 * `AnySchema` bound (same `string extends keyof` test as operations).
 */
export type TxKnownEntity<C extends AnySchema> = string extends keyof C["entities"] ? AnyEntity : C["entities"][keyof C["entities"]];
/** Targeted ref → that entity; `Ref.self` / untargeted → the enclosing entity. */
type RefSlotTarget<N extends AnyEntity, K extends string> = [
    FieldTargetEntity<N["fields"][K]>
] extends [never] ? N : FieldTargetEntity<N["fields"][K]>;
/**
 * Ref forms `put` accepts. Same {@link EntityRef} vocabulary as `set` /
 * `db.run` — no bare `string`. `{ eid, class }` is `op.principal`.
 */
type PutRef<C extends AnySchema, H = TxHandle<C>, Target extends AnyEntity = AnyEntity> = EntityRef<C, Target, H> | {
    readonly eid: number | null;
    readonly class: string;
};
type PutScalar<C extends AnySchema, N extends AnyEntity, K extends string, H = TxHandle<C>> = (N["fields"][K] extends {
    readonly valueType: "ref";
} ? PutRef<C, H, RefSlotTarget<N, K>> : ValueAtIdent<C, `:${N["ns"]}/${K}`>);
type PutFieldValue<C extends AnySchema, N extends AnyEntity, K extends string, H = TxHandle<C>> = N["fields"][K] extends {
    readonly valueType: "ref";
} ? N["fields"][K]["cardinality"] extends "many" ? ReadonlyArray<PutScalar<C, N, K, H>> : PutScalar<C, N, K, H> : WriteAtEntity<C, N>[K];
/**
 * Partial attrs — every key optional. Used by `put(Entity, subject, {…})`
 * and `update`. Cardinality-many is an array; `undefined` is omitted.
 */
export type PutAttrs<C extends AnySchema, N extends AnyEntity, H = TxHandle<C>> = {
    [K in keyof WriteAtEntity<C, N> & string]?: PutFieldValue<C, N, K, H> | undefined;
};
type FieldIsOptional<F> = F extends {
    readonly cardinality: "many";
} ? true : F extends {
    readonly isOptional: true;
} ? true : undefined extends ValueOf<F extends AnyField ? F : never> ? true : false;
type RequiredPutKeys<N extends AnyEntity> = {
    [K in keyof N["fields"] & string]: FieldIsOptional<N["fields"][K]> extends true ? never : K;
}[keyof N["fields"] & string];
type OptionalPutKeys<N extends AnyEntity> = Exclude<keyof N["fields"] & string, RequiredPutKeys<N>>;
/**
 * `put(Entity, {…})` create form: required card-one keys required,
 * optional / card-many omitted. Key-only `put(User, { sub })` is a
 * compile error — that is `update`.
 */
export type PutCreateAttrs<C extends AnySchema, N extends AnyEntity, H = TxHandle<C>> = {
    [K in RequiredPutKeys<N>]: PutFieldValue<C, N, K, H>;
} & {
    [K in OptionalPutKeys<N>]?: PutFieldValue<C, N, K, H> | undefined;
};
type UpsertKeys<N extends AnyEntity> = {
    [K in keyof N["fields"] & string]: N["fields"][K] extends {
        readonly unique: "upsert";
    } ? K : never;
}[keyof N["fields"] & string];
type RequireAtLeastOne<T, Keys extends keyof T> = {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Omit<T, K>>;
}[Keys];
/**
 * `update(Entity, {…})` map form: at least one `unique: "upsert"` field.
 * An entity with no upsert key cannot use this form.
 */
export type UpdateMapAttrs<C extends AnySchema, N extends AnyEntity, H = TxHandle<C>> = [UpsertKeys<N>] extends [never] ? {
    readonly "update map form needs a unique: \"upsert\" field": never;
} : RequireAtLeastOne<PutAttrs<C, N, H>, UpsertKeys<N> & keyof PutAttrs<C, N, H>>;
/**
 * 3-arg `put` subject, narrowed to entity `N` — the same
 * {@link EntityRef} vocabulary as `db.run`. A branded cell of the
 * wrong entity is rejected. No bare `string`.
 */
export type PutSubject<C extends AnySchema, N extends AnyEntity, H = TxHandle<C>> = EntityRef<C, N, H>;
/** Map form: `{ ":db/id"?: e, ":user/name": "Ada", ":user/friends": [ref, …] }`. */
export type TxMap = Readonly<Record<string, unknown>>;
export type TxOp = readonly [":db/add", unknown, string, unknown] | readonly [":db/update", unknown, string, unknown] | readonly [":db/update", unknown] | readonly [":db/retract", unknown, string] | readonly [":db/retract", unknown, string, unknown] | readonly [":db/retractEntity", unknown] | TxMap;
export interface TxSpec {
    readonly ops: readonly TxOp[];
}
/** @internal Collected ops and catalog — not on the public builder shape. */
export declare const TX_INTERNALS: unique symbol;
export interface TxInternals<C extends AnySchema = AnySchema> {
    readonly schema: C;
    readonly ops: () => readonly TxOp[];
}
/** @internal Ops the builder has collected. */
export declare const txOps: (tx: object) => readonly TxOp[];
/** @internal Catalog the builder was created with. */
export declare const txSchema: <C extends AnySchema>(tx: Tx<C>) => C;
/**
 * A tempid / eid / lookup handle. `set` / `remove` take a field from
 * *any* schema entity — that is the bag.
 *
 * Not the public `Entity` (the record type). This name is hatch-only.
 */
export interface TxHandle<C extends AnySchema = AnySchema> {
    readonly _tag: "TxHandle";
    /**
     * What this handle names: a fresh tempid, an eid, or a lookup ref.
     * Not catalog-branded — the handle does not know a namespace — so it
     * is the unbranded-number / tempid / lookup hatch, valid in any ref slot.
     */
    readonly eid: UnbrandedId | Tempid | LookupRef<C>;
    set<const A extends TxField<C>>(field: A, value: TxValue<C, A, TxHandle<C>>): Effect.Effect<void>;
    remove<const A extends TxField<C>>(field: A, value?: TxValue<C, A, TxHandle<C>>): Effect.Effect<void>;
    delete(): Effect.Effect<void>;
}
/**
 * Schema-generic transaction builder. Methods are Effects so the hatch
 * and the op handle can share one lowering. Collected ops live under
 * {@link TX_INTERNALS}, not on this shape.
 */
export interface Tx<C extends AnySchema = AnySchema> {
    /**
     * Allocate a tempid, or wrap an existing eid / tempid / lookup ref.
     * `tx.entity()` → new handle; `tx.entity(1001)`;
     * `tx.entity(tx.tempid("ada"))`; `tx.entity([User.name, "Ada"])`.
     */
    entity(): Effect.Effect<TxHandle<C>>;
    entity(id: TxEntity<C>): Effect.Effect<TxHandle<C>>;
    /** Brand a string as a named tempid. Not a bare `string`. */
    tempid(name: string): Tempid;
    /** Assert one datom. Cardinality-many is one call per value. */
    set<const A extends TxField<C>>(e: TxEntity<C>, field: A, value: TxValue<C, A, TxHandle<C>>): Effect.Effect<void>;
    remove<const A extends TxField<C>>(e: TxEntity<C>, field: A, value?: TxValue<C, A, TxHandle<C>>): Effect.Effect<void>;
    delete(e: TxEntity<C>): Effect.Effect<void>;
    /**
     * Make this row so. Lowers to map form. `undefined` fields are
     * omitted; cardinality-many takes an array. No subject allocates a
     * new record and the map must carry every required field. A numeric
     * subject names an existing record — a missing id is
     * `TxRejected` `tx/missing-entity` (same as {@link Tx.update}; naming
     * never creates). A tempid / handle subject is a create.
     *
     * Including a `unique: "upsert"` field unifies with the existing row
     * — insert-or-update, still with full required data on create.
     * Partial writes to an existing row are {@link Tx.update}.
     *
     * A two-element array whose first value is an ident (`":…"`) is a
     * lookup on a ref field. On a cardinality-many scalar field, that
     * shape is expanded to one value per element so `tags: [":a", "b"]`
     * writes two strings.
     */
    put<N extends TxKnownEntity<C>>(entity: N, attrs: PutCreateAttrs<C, N>): Effect.Effect<TxHandle<C>>;
    put<N extends TxKnownEntity<C>>(entity: N, id: PutSubject<C, N>, attrs: PutAttrs<C, N>): Effect.Effect<TxHandle<C>>;
    /**
     * Change what's there. Partial; never creates. Address by subject
     * (eid / handle / branded cell / lookup) or by a map that contains
     * at least one `unique: "upsert"` field. Missing row →
     * `TxRejected` `tx/missing-entity`. Wrong-entity subject →
     * `tx/wrong-entity`.
     */
    update<N extends TxKnownEntity<C>>(entity: N, attrs: UpdateMapAttrs<C, N>): Effect.Effect<TxHandle<C>>;
    update<N extends TxKnownEntity<C>>(entity: N, id: PutSubject<C, N>, attrs: PutAttrs<C, N>): Effect.Effect<TxHandle<C>>;
}
/**
 * Error / context extracted from a generator body's yielded Effects.
 * Same inference `Effect.gen` uses.
 */
export type YieldError<Eff> = [Eff] extends [never] ? never : [Eff] extends [Effect.Effect<infer _A, infer E, infer _R>] ? E : never;
export type YieldContext<Eff> = [Eff] extends [never] ? never : [Eff] extends [Effect.Effect<infer _A, infer _E, infer R>] ? R : never;
/** @internal An instance handle, as opposed to a raw eid / tempid / lookup. */
export declare const isTxHandle: (e: unknown) => e is TxHandle;
/**
 * Start a schema-typed transaction builder. Used by {@link buildOp} and
 * by compile-time / runtime fixtures. Not a public write path.
 */
export declare const txBuilder: <C extends AnySchema>(schema: C) => Tx<C>;
export {};
//# sourceMappingURL=Tx.d.ts.map