import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { type AllocationDeclaration, type AllocationSlots } from "./allocations.ts";
import { type AnyOptimisticProjection, type OptimisticProjection } from "./Projection.ts";
import type { EntityId as OpaqueEntityId } from "./refs.ts";
import { COMPOSED_TRAITS } from "./Composer.ts";
import type { Eid } from "./Eid.ts";
import type { AnySchema } from "./Schema.ts";
import { InvalidRequest, OperationsCoverageError } from "./Errors.ts";
import type { AnyEntity } from "./Entity.ts";
import type { AnyTrait } from "./Trait.ts";
import type { Tempid } from "./entityArg.ts";
import { type ValidIdentName } from "./IdentName.ts";
import type { EntityRef, LookupRef, UnbrandedId } from "./idents.ts";
import type { AnyQueryObject, QueryObject } from "./query/index.ts";
import { untargetedRef } from "./valueTypes.ts";
import { type PutAttrs, type PutCreateAttrs, type PutSubject, type TxEntity, type TxField, type TxHandle, type TxKnownEntity, type TxValue, type UpdateMapAttrs } from "./Tx.ts";
type ConcreteCatalog<C extends AnySchema> = string extends keyof C["entities"] ? false : true;
type OpKnownEntity<C extends AnySchema> = [ConcreteCatalog<C>] extends [true] ? TxKnownEntity<C> : AnyEntity;
type OpPutAttrs<C extends AnySchema, E extends AnyEntity> = [
    ConcreteCatalog<C>
] extends [true] ? PutAttrs<C, E, TxHandle<C> | AnyOpHandle<C>> : Record<string, unknown>;
type OpPutCreateAttrs<C extends AnySchema, E extends AnyEntity> = [
    ConcreteCatalog<C>
] extends [true] ? PutCreateAttrs<C, E, TxHandle<C> | AnyOpHandle<C>> : Record<string, unknown>;
type OpUpdateMapAttrs<C extends AnySchema, E extends AnyEntity> = [
    ConcreteCatalog<C>
] extends [true] ? UpdateMapAttrs<C, E, TxHandle<C> | AnyOpHandle<C>> : Record<string, unknown>;
export type OpField<C extends AnySchema> = [ConcreteCatalog<C>] extends [true] ? TxField<C> : {
    readonly ident: string;
} | string;
type FieldRefValue<C extends AnySchema, A> = A extends {
    readonly schema: {
        readonly Type: infer T;
    };
} ? T | (A extends {
    readonly valueType: "ref";
} ? EntityRef<C, AnyEntity, TxHandle<C> | AnyOpHandle<C>> : never) : unknown;
export type OpValue<C extends AnySchema, A> = [ConcreteCatalog<C>] extends [true] ? TxValue<C, A, TxHandle<C> | AnyOpHandle<C>> : FieldRefValue<C, A>;
export type OpEntity<C extends AnySchema> = TxEntity<C> | AnyOpHandle<C>;
type OpPutSubject<C extends AnySchema, E extends AnyEntity> = [
    ConcreteCatalog<C>
] extends [true] ? PutSubject<C, E, TxHandle<C> | AnyOpHandle<C>> : OpEntity<C>;
export type RunEntity<C extends AnySchema, N extends AnyEntity> = EntityRef<C, N, TxHandle<C> | AnyOpHandle<C>>;
type CatalogCovers<C extends AnySchema, OC extends AnySchema> = C extends AnySchema ? keyof OC["entities"] extends keyof C["entities"] ? true : false : false;
export type OpCatalogFitsDb<C extends AnySchema, OC extends AnySchema> = [ConcreteCatalog<OC>] extends [false] ? true : CatalogCovers<C, OC> extends true ? true : false;
export type OpCatalogMismatch = "operation schema does not match this db";
export type RunArg<C extends AnySchema, OC extends AnySchema, A> = OpCatalogFitsDb<C, OC> extends true ? A : OpCatalogMismatch;
export declare const EntityId: typeof untargetedRef;
/**
 * The opaque public handle that fills an {@link EntityId} slot.
 *
 * The value above declares the *slot*; this type is the durable, entity-branded
 * identity that travels through it — the sealed server-issued handle a queued
 * mutation may name as its target, never a numeric eid. Declaring both under
 * one name is deliberate: `Ramose.EntityId` is the entity id, whether an author
 * is writing a schema or typing a handle they were given.
 */
export type EntityId<Entity extends AnyEntity = AnyEntity> = OpaqueEntityId<Entity>;
export type OutputDraft<O> = O extends number ? O | {
    readonly _tag: "TxHandle";
} : O extends ReadonlyArray<infer U> ? {
    readonly [K in keyof O]: OutputDraft<U>;
} : O extends object ? {
    [K in keyof O]: OutputDraft<O[K]>;
} : O;
/** Who the body sees as the caller. `eid` is `null` until the principal row exists. */
export interface OpPrincipal {
    readonly eid: number | null;
    readonly class: string;
    readonly sub?: string;
    readonly name?: string;
    readonly claims: Readonly<Record<string, unknown>>;
}
/**
 * What an `op.effect` thunk receives during authoritative execution.
 */
export interface OperationEffectContext {
    readonly env: unknown;
    readonly principal: OpPrincipal;
}
export type EffectThunk<A = unknown> = (ctx: OperationEffectContext) => Promise<A> | A;
export type OpHandleId<C extends AnySchema = AnySchema> = UnbrandedId | Tempid | LookupRef<C>;
export interface OpHandle<C extends AnySchema = AnySchema, Id = OpHandleId<C>> {
    readonly _tag: "TxHandle";
    readonly eid: Id;
    set<const A extends OpField<C>>(field: A, value: OpValue<C, A>): void;
    remove<const A extends OpField<C>>(field: A, value?: OpValue<C, A>): void;
    delete(): void;
}
export type AnyOpHandle<C extends AnySchema = AnySchema> = OpHandle<C, any>;
export type OperationOwner = AnyEntity | AnyTrait;
/**
 * Symbol-keyed operation metadata. A symbol preserves the long-standing right
 * to declare an ordinary schema field named `operations`.
 */
export declare const OwnedOperations: unique symbol;
declare const OwnedOperationOwnerBrand: unique symbol;
declare const OwnedOpContextBrand: unique symbol;
declare const OwnedOperationAuthorToken: unique symbol;
type OperationOwnerShape = {
    readonly _tag: "Entity" | "Trait";
    readonly ns: string;
    readonly fields: object;
};
type MutableField<Definition extends OperationOwnerShape> = Definition["fields"][keyof Definition["fields"] & string] extends infer Field ? Field extends {
    readonly ident: string;
} ? Field extends {
    readonly fixed: true;
} ? never : Field : never : never;
type TraitComposerEntity<Target extends AnyTrait> = AnyEntity & {
    readonly [COMPOSED_TRAITS]: {
        readonly [Name in Target["ns"]]: true;
    };
};
type OwnedInvocationEntity<Owner extends OperationOwnerShape> = Owner extends {
    readonly _tag: "Entity";
} ? Owner & AnyEntity : Owner extends {
    readonly _tag: "Trait";
} ? TraitComposerEntity<Owner & AnyTrait> : never;
type OwnedHandleRef<Target extends AnyEntity> = {
    readonly _tag: "TxHandle";
    readonly eid: Eid<Target> | Tempid;
};
type OwnedFieldValue<Owner extends OperationOwnerShape, A> = A extends {
    readonly valueType: "ref";
    readonly schema: {
        readonly _target?: infer Target;
    };
} ? Exclude<Target, undefined> extends infer Declared ? Declared extends AnyEntity ? EntityRef<AnySchema, Declared, OwnedHandleRef<Declared>> : Declared extends AnyTrait ? EntityRef<AnySchema, TraitComposerEntity<Declared>, OwnedHandleRef<TraitComposerEntity<Declared>>> : Owner extends {
    readonly _tag: "Entity";
} ? EntityRef<AnySchema, OwnedInvocationEntity<Owner>, OwnedHandleRef<OwnedInvocationEntity<Owner>>> : Owner extends {
    readonly _tag: "Trait";
} ? EntityRef<AnySchema, OwnedInvocationEntity<Owner>, OwnedHandleRef<OwnedInvocationEntity<Owner>>> : EntityRef<AnySchema, AnyEntity, AnyOpHandle> : never : OpValue<AnySchema, A>;
type EntityIdentity<Entity extends AnyEntity> = Pick<Entity, "_tag" | "ns" | "fields"> & Pick<AnyEntity, "id" | typeof COMPOSED_TRAITS | typeof OwnedOperations>;
type EntityRefOf<Entity extends AnyEntity> = EntityRef<AnySchema, EntityIdentity<Entity>, OwnedHandleRef<EntityIdentity<Entity>>>;
export type OwnedEntityHandle<Entity extends AnyEntity> = Omit<OpHandle<AnySchema>, "eid" | "set" | "remove"> & {
    readonly eid: Eid<Entity> | Tempid;
    set<const A extends MutableField<Entity>>(field: A, value: OwnedFieldValue<Entity, A>): void;
    remove<const A extends MutableField<Entity>>(field: A, value?: OwnedFieldValue<Entity, A>): void;
};
export type OwnedTargetHandle<Owner extends OperationOwnerShape> = Omit<OpHandle<AnySchema>, "eid" | "set" | "remove"> & {
    readonly eid: Eid<OwnedInvocationEntity<Owner>> | Tempid;
    set<const A extends MutableField<Owner>>(field: A, value: OwnedFieldValue<Owner, A>): void;
    remove<const A extends MutableField<Owner>>(field: A, value?: OwnedFieldValue<Owner, A>): void;
};
type OwnerEntity<Owner extends OperationOwnerShape> = Owner extends {
    readonly _tag: "Entity";
    readonly fields: AnyEntity["fields"];
} ? Owner & Pick<AnyEntity, "id" | typeof COMPOSED_TRAITS | typeof OwnedOperations> : never;
type DefinitionWriteEntity<Owner extends OperationOwnerShape, Writes extends readonly AnyEntity[]> = OwnerEntity<Owner> | Writes[number];
type DecodedFieldValue<Field> = Field extends {
    readonly schema: {
        readonly Type: infer Value;
    };
} ? Value : unknown;
type FieldIsOptional<Field> = Field extends {
    readonly cardinality: "many";
} ? true : Field extends {
    readonly isOptional: true;
} ? true : Field extends {
    readonly default: (...args: never[]) => unknown;
} ? true : Field extends {
    readonly compositionDefault: true;
} ? true : undefined extends DecodedFieldValue<Field> ? true : false;
type MutableKeys<Entity extends AnyEntity> = {
    [K in keyof Entity["fields"] & string]: Entity["fields"][K] extends {
        readonly fixed: true;
    } ? never : K;
}[keyof Entity["fields"] & string];
type RequiredCreateKeys<Entity extends AnyEntity> = {
    [K in MutableKeys<Entity>]: FieldIsOptional<Entity["fields"][K]> extends true ? never : K;
}[MutableKeys<Entity>];
type OptionalCreateKeys<Entity extends AnyEntity> = Exclude<MutableKeys<Entity>, RequiredCreateKeys<Entity>>;
type DefinitionWriteValue<Entity extends AnyEntity, K extends keyof Entity["fields"] & string> = Entity["fields"][K] extends infer Field ? Field extends {
    readonly cardinality: "many";
} ? ReadonlyArray<OwnedFieldValue<Entity, Field>> : OwnedFieldValue<Entity, Field> : never;
type FixedAttrs<Entity extends AnyEntity> = {
    [K in keyof Entity["fields"] & string as Entity["fields"][K] extends {
        readonly fixed: true;
    } ? K : never]?: never;
};
type CreateAttrsForEntity<Entity extends AnyEntity> = {
    [K in RequiredCreateKeys<Entity>]: DefinitionWriteValue<Entity, K>;
} & {
    [K in OptionalCreateKeys<Entity>]?: DefinitionWriteValue<Entity, K> | undefined;
} & FixedAttrs<Entity>;
type CreateAttrsOf<Entity extends AnyEntity> = Entity extends AnyEntity ? CreateAttrsForEntity<Entity> : never;
type MutableAttrsForEntity<Entity extends AnyEntity> = {
    [K in MutableKeys<Entity>]?: DefinitionWriteValue<Entity, K> | undefined;
} & FixedAttrs<Entity>;
type MutableAttrsOf<Entity extends AnyEntity> = Entity extends AnyEntity ? MutableAttrsForEntity<Entity> : never;
type UpsertKeys<Entity extends AnyEntity> = {
    [K in MutableKeys<Entity>]: Entity["fields"][K] extends {
        readonly unique: "upsert";
    } ? K : never;
}[MutableKeys<Entity>];
type RequireAtLeastOne<T, Keys extends keyof T> = {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Omit<T, K>>;
}[Keys];
type UpdateMapAttrsForEntity<Entity extends AnyEntity> = [
    UpsertKeys<Entity>
] extends [never] ? {
    readonly "update map form needs a unique: \"upsert\" field": never;
} : RequireAtLeastOne<MutableAttrsOf<Entity>, UpsertKeys<Entity> & keyof MutableAttrsOf<Entity>>;
type OwnerCreateAttrs<Owner extends OperationOwnerShape> = Owner extends {
    readonly _tag: "Entity";
    readonly fields: AnyEntity["fields"];
} ? CreateAttrsOf<OwnerEntity<Owner>> : never;
type OwnedEntityRef<Owner extends OperationOwnerShape> = EntityRef<AnySchema, OwnedInvocationEntity<Owner>, OwnedHandleRef<OwnedInvocationEntity<Owner>>>;
export type OwnedOp<Owner extends OperationOwnerShape, Self extends boolean, Writes extends readonly AnyEntity[] = readonly []> = Omit<Op<AnySchema, undefined>, "self" | "entity" | "set" | "remove" | "delete" | "put" | "update"> & {
    readonly [OwnedOpContextBrand]: {
        readonly owner: Owner;
        readonly self: Self;
        readonly writes: Writes;
    };
    readonly self: Self extends true ? OwnedTargetHandle<Owner> : undefined;
    entity(id: OwnedEntityRef<Owner>): OwnedTargetHandle<Owner>;
    entity<const Entity extends DefinitionWriteEntity<Owner, Writes>>(definition: Entity, id: EntityRefOf<NoInfer<Entity>>): OwnedEntityHandle<Entity>;
    set<const Entity extends DefinitionWriteEntity<Owner, Writes>, const A extends MutableField<NoInfer<Entity>>>(definition: Entity, entity: EntityRefOf<NoInfer<Entity>>, field: A, value: OwnedFieldValue<NoInfer<Entity>, A>): void;
    remove<const Entity extends DefinitionWriteEntity<Owner, Writes>, const A extends MutableField<NoInfer<Entity>>>(definition: Entity, entity: EntityRefOf<NoInfer<Entity>>, field: A, value?: OwnedFieldValue<NoInfer<Entity>, A>): void;
    delete<const Entity extends DefinitionWriteEntity<Owner, Writes>>(definition: Entity, entity: EntityRefOf<NoInfer<Entity>>): void;
    put<const Entity extends DefinitionWriteEntity<Owner, Writes>>(...args: Entity extends AnyEntity ? [entity: Entity, attrs: CreateAttrsForEntity<NoInfer<Entity>>] : never): OwnedEntityHandle<Entity>;
    put<const Entity extends DefinitionWriteEntity<Owner, Writes>>(...args: Entity extends AnyEntity ? [
        entity: Entity,
        id: EntityRefOf<NoInfer<Entity>>,
        attrs: MutableAttrsForEntity<NoInfer<Entity>>
    ] : never): OwnedEntityHandle<Entity>;
    update<const Entity extends DefinitionWriteEntity<Owner, Writes>>(...args: Entity extends AnyEntity ? [entity: Entity, attrs: UpdateMapAttrsForEntity<NoInfer<Entity>>] : never): OwnedEntityHandle<Entity>;
    update<const Entity extends DefinitionWriteEntity<Owner, Writes>>(...args: Entity extends AnyEntity ? [
        entity: Entity,
        id: EntityRefOf<NoInfer<Entity>>,
        attrs: MutableAttrsForEntity<NoInfer<Entity>>
    ] : never): OwnedEntityHandle<Entity>;
    readonly create: Self extends false ? Owner extends {
        readonly _tag: "Entity";
    } ? (attrs: OwnerCreateAttrs<Owner>) => OwnedEntityHandle<OwnerEntity<Owner>> : undefined : undefined;
};
type UnboundOwnedOp<Self extends boolean> = Omit<Op<AnySchema, undefined>, "self"> & {
    readonly self: Self extends true ? unknown : undefined;
    readonly create: Self extends false ? ((...args: never[]) => OpHandle<AnySchema>) | undefined : undefined;
};
/**
 * The handle an authoritative operation body uses. Transaction verbs
 * accumulate one commit. Write slots are {@link TxField} / {@link TxValue} / {@link TxEntity}
 * (thin aliases when the catalog is concrete).
 */
export interface Op<C extends AnySchema = AnySchema, N extends AnyEntity | undefined = undefined> {
    readonly self: [N] extends [AnyEntity] ? OpHandle<C, Eid<N> | Tempid> : undefined;
    readonly principal: OpPrincipal;
    readonly db: string;
    entity(): OpHandle<C>;
    entity(id: OpEntity<C>): OpHandle<C>;
    tempid(name: string): Tempid;
    set<const A extends OpField<C>>(e: OpEntity<C>, field: A, value: OpValue<C, A>): void;
    remove<const A extends OpField<C>>(e: OpEntity<C>, field: A, value?: OpValue<C, A>): void;
    delete(e: OpEntity<C>): void;
    put<E extends OpKnownEntity<C>>(entity: E, attrs: OpPutCreateAttrs<C, E>): OpHandle<C>;
    put<E extends OpKnownEntity<C>>(entity: E, id: OpPutSubject<C, E>, attrs: OpPutAttrs<C, E>): OpHandle<C>;
    update<E extends OpKnownEntity<C>>(entity: E, attrs: OpUpdateMapAttrs<C, E>): OpHandle<C>;
    update<E extends OpKnownEntity<C>>(entity: E, id: OpPutSubject<C, E>, attrs: OpPutAttrs<C, E>): OpHandle<C>;
    query<Row, Out = readonly Row[]>(input: QueryObject<Row, Out>): Promise<Out>;
    query(input: AnyQueryObject): Promise<unknown>;
    pull(subject: unknown, pattern: unknown): Promise<unknown>;
    effect<A>(name: string, run: EffectThunk<A>): Promise<A>;
}
export interface Operation<Name extends string = string, I = unknown, O = unknown, N extends AnyEntity | undefined = undefined, C extends AnySchema = AnySchema> {
    readonly _tag: "Operation";
    readonly name: Name;
    readonly input: Schema.Codec<I, unknown>;
    readonly output: Schema.Codec<O, unknown>;
    readonly on: N | undefined;
    readonly doc: string | undefined;
    readonly body: (op: Op<C, N>, input: I) => Promise<OutputDraft<O>> | OutputDraft<O>;
}
export type AnyOperation = Operation<string, any, any, any, any>;
type CodecType<S> = S extends {
    readonly Type: infer T;
} ? T : unknown;
type NormalizeOwnedSelf<Self extends boolean> = boolean extends Self ? boolean : Self extends false ? false : true;
type OwnedRun<Owner extends OperationOwnerShape, ICodec extends Schema.Top, OCodec extends Schema.Top, Self extends boolean, Writes extends readonly AnyEntity[]> = (op: OwnedOp<Owner, Self, Writes>, input: CodecType<ICodec>) => Promise<OutputDraft<CodecType<OCodec>>> | OutputDraft<CodecType<OCodec>>;
type UnboundOwnedRun<ICodec extends Schema.Top, OCodec extends Schema.Top, Self extends boolean> = (op: UnboundOwnedOp<Self>, input: CodecType<ICodec>) => Promise<OutputDraft<CodecType<OCodec>>> | OutputDraft<CodecType<OCodec>>;
export interface UnboundOperation<ICodec extends Schema.Top = Schema.Top, OCodec extends Schema.Top = Schema.Top, Self extends boolean = boolean, Writes extends readonly AnyEntity[] = readonly AnyEntity[]> {
    readonly _tag: "UnboundOperation";
    readonly input: ICodec;
    readonly output: OCodec;
    readonly self: Self;
    readonly writes: Writes;
    readonly allocations: AllocationSlots;
    readonly revision: number;
    readonly optimistic: AnyOptimisticProjection | undefined;
    readonly optimisticRevision: number;
    readonly doc: string | undefined;
    readonly run: UnboundOwnedRun<ICodec, OCodec, Self>;
}
export type AnyUnboundOperation = UnboundOperation<Schema.Top, Schema.Top, boolean, readonly AnyEntity[]>;
type OwnerAuthoredOperation<Owner extends OperationOwnerShape, ICodec extends Schema.Top = Schema.Top, OCodec extends Schema.Top = Schema.Top, Self extends boolean = boolean, Writes extends readonly AnyEntity[] = readonly AnyEntity[]> = UnboundOperation<ICodec, OCodec, Self, Writes> & {
    readonly [OwnedOperationOwnerBrand]: Owner;
    readonly [OwnedOperationAuthorToken]: object;
};
export interface OwnedOperation<Owner extends OperationOwner = OperationOwner, LocalName extends string = string, ICodec extends Schema.Top = Schema.Top, OCodec extends Schema.Top = Schema.Top, Self extends boolean = boolean, Writes extends readonly AnyEntity[] = readonly AnyEntity[]> {
    readonly _tag: "OwnedOperation";
    readonly owner: Owner;
    readonly localName: LocalName;
    readonly input: ICodec;
    readonly output: OCodec;
    readonly self: Self;
    readonly writes: Writes;
    readonly allocations: AllocationSlots;
    readonly revision: number;
    readonly optimistic: AnyOptimisticProjection | undefined;
    readonly optimisticRevision: number;
    readonly doc: string | undefined;
    readonly run: OwnedRun<Owner, ICodec, OCodec, Self, Writes>;
}
export type AnyOwnedOperation = {
    readonly _tag: "OwnedOperation";
    readonly owner: OperationOwner;
    readonly localName: string;
    readonly input: Schema.Top;
    readonly output: Schema.Top;
    readonly self: boolean;
    readonly writes: readonly AnyEntity[];
    readonly allocations: AllocationSlots;
    readonly revision: number;
    readonly optimistic: AnyOptimisticProjection | undefined;
    readonly optimisticRevision: number;
    readonly doc: string | undefined;
    readonly run: (...args: never[]) => unknown;
};
type BoundOwnedOperation<Owner extends OperationOwner, LocalName extends string, Spec> = Spec extends UnboundOperation<infer ICodec, infer OCodec, infer Self, infer Writes> ? OwnedOperation<Owner, LocalName, ICodec, OCodec, Self, Writes> : never;
export type BoundOwnerOperations<Owner extends OperationOwner, Ops extends Readonly<Record<string, AnyUnboundOperation>>> = {
    readonly [K in keyof Ops]: BoundOwnedOperation<Owner, K & string, Ops[K]>;
};
type InvalidOperationName<K extends string> = {
    readonly [P in `invalid operation name ${K}`]: true;
};
export type ValidOwnedOperationMap<Ops extends Readonly<Record<string, AnyUnboundOperation>>, Owner extends OperationOwnerShape> = string extends keyof Ops ? never : {
    readonly [K in keyof Ops]: K extends string ? K extends ValidIdentName<K> ? Ops[K] extends {
        readonly [OwnedOperationOwnerBrand]: Owner;
    } ? Ops[K] : never : Ops[K] & InvalidOperationName<K> : never;
};
export interface Operations<M extends Record<string, AnyOperation> = Record<string, AnyOperation>> {
    readonly _tag: "Operations";
    readonly operations: M;
    readonly schema?: AnySchema;
    get(name: string): AnyOperation | undefined;
    names(): readonly string[];
    cards(): readonly OperationCard[];
}
export type AnyOperations = Operations<Record<string, AnyOperation>>;
/** A catalog-bound registry — {@link defineOperations}'s return. */
export interface DefinedOperations<C extends AnySchema, M extends Record<string, AnyOperation> = Record<string, AnyOperation>> extends Operations<M> {
    readonly schema: C;
}
/**
 * One registered operation, as discovery later reads it. Name is the
 * wire id; `doc` is the human / tool description; `on` is the entity ns
 * when the op is contextual.
 */
export interface OperationCard {
    readonly name: string;
    readonly doc?: string;
    readonly on?: string;
}
export interface OperationSchemas<I, O, N extends AnyEntity | undefined = undefined, C extends AnySchema = AnySchema> {
    readonly input: Schema.Codec<I, unknown>;
    readonly output?: Schema.Codec<O, unknown>;
    readonly on?: N;
    readonly schema?: C;
    readonly doc?: string;
}
type OnEntity<C extends AnySchema> = [ConcreteCatalog<C>] extends [true] ? C["entities"][keyof C["entities"]] | undefined : AnyEntity | undefined;
type CatalogEntity<C extends AnySchema> = [ConcreteCatalog<C>] extends [true] ? C["entities"][keyof C["entities"]] : AnyEntity;
export declare const DEFAULT_OPERATION_REVISION = 1;
export declare const normalizeOperationRevision: (value: unknown) => number;
type OwnedOperationSpec<ICodec extends Schema.Top, OCodec extends Schema.Top, Self extends boolean, Writes extends readonly AnyEntity[], Context, Run> = {
    readonly input: ICodec;
    readonly output: OCodec;
    readonly self?: Self;
    readonly writes?: ValidWriteDefinitions<Writes>;
    readonly allocates?: AllocationDeclaration<OCodec>;
    readonly revision?: number;
    readonly optimistic?: OptimisticProjection<CodecType<ICodec>>;
    readonly optimisticRevision?: number;
    readonly doc?: string;
    readonly run: [Context] extends [never] ? UnboundOwnedRun<ICodec, OCodec, NormalizeOwnedSelf<Self>> : Context extends OperationOwnerShape ? OwnedRun<Context, ICodec, OCodec, NormalizeOwnedSelf<Self>, Writes> & Run & ExactRunContext<Run, OwnedOp<Context, NormalizeOwnedSelf<Self>, Writes>> : never;
};
type RunContext<Run> = Run extends (...args: infer Args) => unknown ? Args["length"] extends 0 ? undefined : Args[0] : never;
type ExactRunContext<Run, Expected> = [RunContext<Run>] extends [undefined] ? unknown : [RunContext<Run>] extends [Expected] ? [Expected] extends [RunContext<Run>] ? unknown : never : never;
type IsUnion<T, Whole = T> = T extends unknown ? [Whole] extends [T] ? false : true : never;
type ValidWriteDefinitions<Writes extends readonly AnyEntity[]> = number extends Writes["length"] ? never : true extends IsUnion<Writes> ? never : Writes;
export interface OwnedOperationAuthor<Owner extends OperationOwnerShape> {
    <const ICodec extends Schema.Top, const OCodec extends Schema.Top, const Self extends boolean = true, const Writes extends readonly AnyEntity[] = readonly [], const Run extends OwnedRun<Owner, ICodec, OCodec, NormalizeOwnedSelf<Self>, Writes> = OwnedRun<Owner, ICodec, OCodec, NormalizeOwnedSelf<Self>, Writes>>(spec: OwnedOperationSpec<ICodec, OCodec, Self, Writes, Owner, Run>): OwnerAuthoredOperation<Owner, ICodec, OCodec, NormalizeOwnedSelf<Self>, Writes>;
    readonly [OwnedOperationAuthorToken]: object;
}
declare function defineOperation<const ICodec extends Schema.Top, const OCodec extends Schema.Top, const Self extends boolean = true, const Writes extends readonly AnyEntity[] = readonly [], const Run extends UnboundOwnedRun<ICodec, OCodec, NormalizeOwnedSelf<Self>> = UnboundOwnedRun<ICodec, OCodec, NormalizeOwnedSelf<Self>>>(spec: OwnedOperationSpec<ICodec, OCodec, Self, Writes, never, Run>): UnboundOperation<ICodec, OCodec, NormalizeOwnedSelf<Self>, Writes>;
declare function defineOperation<Name extends string, I, O = {}, C extends AnySchema = AnySchema, N extends OnEntity<C> = undefined>(name: Name, schemas: OperationSchemas<I, O, N, C>, body: (op: Op<C, N>, input: I) => Promise<OutputDraft<O>> | OutputDraft<O>): Operation<Name, I, O, N, C>;
type FieldSchemaType<E extends AnyEntity, K extends string> = E["fields"][K] extends {
    readonly schema: {
        readonly Type: infer T;
    };
} ? T : unknown;
type PatchInput<E extends AnyEntity, Keys extends readonly string[]> = {
    readonly [K in Keys[number]]: FieldSchemaType<E, K>;
};
declare const definePatch: <Name extends string, E extends AnyEntity, const Keys extends readonly (keyof E["fields"] & string)[], C extends AnySchema = AnySchema>(name: Name, entity: E, keys: Keys, options?: {
    readonly doc?: string;
    readonly schema?: C;
}) => Operation<Name, PatchInput<E, Keys>, {}, E, C>;
type OperationDefine<C extends AnySchema> = <Name extends string, I, O = {}, N extends OnEntity<C> = undefined>(name: Name, schemas: Omit<OperationSchemas<I, O, N, C>, "schema">, body: (op: Op<C, N>, input: I) => Promise<OutputDraft<O>> | OutputDraft<O>) => Operation<Name, I, O, N, C>;
type OperationPatch<C extends AnySchema> = <Name extends string, E extends CatalogEntity<C>, const Keys extends readonly (keyof E["fields"] & string)[]>(name: Name, entity: E, keys: Keys, options?: {
    readonly doc?: string;
}) => Operation<Name, PatchInput<E, Keys>, {}, E, C>;
type OperationFor<C extends AnySchema> = OperationDefine<C> & {
    readonly patch: OperationPatch<C>;
};
declare const operationFor: <C extends AnySchema>(schema: C) => OperationFor<C>;
export declare const bindOwnedOperations: <Owner extends OperationOwner, const Ops extends Readonly<Record<string, AnyUnboundOperation>>>(owner: Owner, operations: Ops | undefined, author?: OwnedOperationAuthor<OperationOwnerShape>) => BoundOwnerOperations<Owner, Ops>;
export declare const isOwnedOperation: (value: unknown) => value is AnyOwnedOperation;
export declare const ownedOperationAuthor: <Owner extends OperationOwnerShape>() => OwnedOperationAuthor<Owner>;
/** Define one named operation. `Operation.for(catalog)` bakes `schema:` in. */
export declare const Operation: typeof defineOperation & {
    readonly for: typeof operationFor;
    readonly patch: typeof definePatch;
};
/** An inert registry of operation declarations. */
export declare const Operations: <const M extends Record<string, AnyOperation>>(operations: M) => Operations<M>;
type OpsFitCatalog<C extends AnySchema, M extends Record<string, AnyOperation>> = {
    [K in keyof M]: M[K] extends Operation<any, any, any, any, infer OC> ? OpCatalogFitsDb<C, OC> extends true ? M[K] : OpCatalogMismatch : M[K];
};
export declare const defineOperations: <C extends AnySchema, const M extends Record<string, AnyOperation>>(schema: C, operations: OpsFitCatalog<C, M> & M) => DefinedOperations<C, M>;
/** Sorted unique wire ids in a registry. */
export declare const operationNames: (ops: AnyOperations | undefined) => string[];
/** Discovery cards (name / doc / on) for a registry. */
export declare const operationCards: (ops: AnyOperations | undefined) => readonly OperationCard[];
/**
 * A runtime registry must cover every required id. Extra registered ops are
 * fine. Missing ids throw
 * {@link OperationsCoverageError}.
 */
export declare const checkOperationsCoverage: (required: AnyOperations | readonly string[], registered: AnyOperations | readonly string[]) => void;
export { OperationsCoverageError };
export { asLookupRef, lowerEntityArg } from "./entityArg.ts";
export declare const decodeInput: <I>(schema: Schema.Codec<I, unknown>, input: unknown) => Effect.Effect<I, InvalidRequest>;
export declare const encodeOutput: <O>(schema: Schema.Codec<O, unknown>, output: unknown) => Effect.Effect<unknown, InvalidRequest>;
export declare const decodeOutput: <O>(schema: Schema.Codec<O, unknown>, output: unknown) => Effect.Effect<O, InvalidRequest>;
//# sourceMappingURL=Operation.d.ts.map