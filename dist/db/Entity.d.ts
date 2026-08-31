import { COMPOSED_TRAITS } from "./Composer.ts";
import type { AnyField } from "./Field.ts";
import { type FlattenedTraitFields, type ValidFieldMap, type ValidIdentName, type ValidTraitCompose } from "./IdentName.ts";
import { type AttrNav, type PathCarrier } from "./shapes.ts";
import type { AnyTrait } from "./Trait.ts";
import { OwnedOperations, type AnyUnboundOperation, type BoundOwnerOperations, type OwnedOperationAuthor, type ValidOwnedOperationMap } from "./Operation.ts";
export type FieldMap = Record<string, AnyField>;
export type StampedField<Ns extends string, Name extends string, A extends AnyField> = AttrNav<A & {
    readonly attrName: Name;
    readonly ident: `:${Ns}/${Name}`;
} & PathCarrier>;
type BacklinkNav<Ns extends string, A extends AnyField, Name extends string, Card extends "one" | "many"> = AttrNav<Omit<A, "cardinality" | "valueType" | "schema"> & {
    readonly attrName: Name;
    readonly ident: `:${Ns}/${Name}`;
    readonly cardinality: Card;
    readonly valueType: "ref";
    readonly __reverse: true;
} & PathCarrier>;
export type ReverseNav<Ns extends string, A extends AnyField, Name extends string> = BacklinkNav<Ns, A, Name, "many">;
export type OwnedReverseNav<Ns extends string, A extends AnyField, Name extends string> = BacklinkNav<Ns, A, Name, "one">;
export type NavStamp<Ns extends string, A extends AnyField, Name extends string> = A["valueType"] extends "ref" ? StampedField<Ns, Name, A> & {
    readonly reverse: [A["owned"]] extends [true] ? OwnedReverseNav<Ns, A, Name> : ReverseNav<Ns, A, Name>;
} : StampedField<Ns, Name, A>;
export type StampedMap<Ns extends string, Fields extends FieldMap> = {
    readonly [K in keyof Fields]: NavStamp<Ns, Fields[K], K & string>;
};
/**
 * Stamped fields plus metadata. Address a field as `User.name`.
 * `fields` is the iteration map (`schemaTx`, `pick`, policy) — not a
 * second public handle. `id`, `ns`, `fields`, `_tag`, and `traits` cannot
 * be field names, so spreading cannot overwrite metadata. Entity documentation
 * uses a collision-free internal slot, leaving `doc` available as an
 * application field.
 *
 * Composed trait fields are intersected onto the instance (`Issue.tag`)
 * and keep the trait ident (`Issue.tag.ident === ":taggable/tag"`).
 */
export type Entity<Name extends string = string, Fields extends FieldMap = FieldMap, Ops extends Readonly<Record<string, AnyUnboundOperation>> = {}> = {
    readonly _tag: "Entity";
    readonly ns: Name;
    readonly fields: StampedMap<Name, Fields>;
    readonly traits: readonly {
        readonly ns: string;
    }[];
    readonly [OwnedOperations]: BoundOwnerOperations<Entity<Name, Fields, Ops>, Ops>;
    readonly id: AttrNav<AnyField & {
        readonly schema: {
            readonly Type: number;
        };
        readonly attrName: "id";
        readonly ident: ":db/id";
        readonly valueType: "ref";
        readonly cardinality: "one";
        readonly _ns?: Entity<Name, Fields>;
    } & PathCarrier>;
} & StampedMap<Name, Fields>;
/**
 * Bound for entity-generic helpers. `fields` is a wide record so a
 * composer with flattened trait fields stays assignable — `StampedMap`
 * would demand `orDefault(unknown)` and reject specific field refs.
 */
export type AnyEntity = {
    readonly _tag: "Entity";
    readonly ns: string;
    readonly fields: {
        readonly [key: string]: AnyField & {
            readonly ident: string;
        };
    };
    readonly [COMPOSED_TRAITS]?: Readonly<Record<string, true>>;
    readonly id: AttrNav<AnyField & {
        readonly schema: {
            readonly Type: number;
        };
        readonly attrName: "id";
        readonly ident: ":db/id";
        readonly valueType: "ref";
        readonly cardinality: "one";
    } & PathCarrier>;
    readonly [OwnedOperations]?: Readonly<Record<string, unknown>>;
};
type TraitClosure<T> = T extends AnyTrait ? T | TraitClosure<T["traits"][number]> : never;
type ComposedTraitMap<T extends AnyTrait> = {
    readonly [Trait in T as Trait["ns"]]: true;
};
export type EntityOptions<Traits extends readonly AnyTrait[] = readonly AnyTrait[]> = {
    readonly traits?: Traits;
    readonly doc?: string;
};
export declare namespace Entity {
    type Any = AnyEntity;
}
export declare const stamp: <Name extends string, Fields extends FieldMap>(name: Name, fields: Fields) => StampedMap<Name, Fields>;
type EntityWithTraits<Name extends string, Fields extends FieldMap, Traits extends readonly AnyTrait[], Ops extends Readonly<Record<string, AnyUnboundOperation>>> = Entity<Name, Fields, Ops> & FlattenedTraitFields<Traits> & {
    readonly fields: StampedMap<Name, Fields> & FlattenedTraitFields<Traits>;
    readonly traits: Traits;
    readonly [OwnedOperations]: BoundOwnerOperations<Entity<Name, Fields, Ops> & {
        readonly fields: StampedMap<Name, Fields> & FlattenedTraitFields<Traits>;
        readonly traits: Traits;
        readonly [COMPOSED_TRAITS]: ComposedTraitMap<TraitClosure<Traits[number]>>;
    }, Ops>;
    readonly [COMPOSED_TRAITS]: ComposedTraitMap<TraitClosure<Traits[number]>>;
};
type EntityOperationContext<Name extends string, Fields extends FieldMap, Traits extends readonly AnyTrait[]> = {
    readonly _tag: "Entity";
    readonly ns: Name;
    readonly fields: StampedMap<Name, Fields> & FlattenedTraitFields<Traits>;
    readonly traits: Traits;
    readonly [COMPOSED_TRAITS]: ComposedTraitMap<TraitClosure<Traits[number]>>;
};
/** Group fields under one ident prefix. */
export declare function Entity<const Name extends string, Fields extends FieldMap>(name: ValidIdentName<Name>, fields: Fields & ValidFieldMap<Fields>): Entity<Name, Fields>;
export declare function Entity<const Name extends string, Fields extends FieldMap, const Ops extends Readonly<Record<string, AnyUnboundOperation>> = {}>(name: ValidIdentName<Name>, fields: Fields & ValidFieldMap<Fields>, options: {
    readonly traits?: never;
    readonly doc?: string;
    readonly operations: (Operation: OwnedOperationAuthor<EntityOperationContext<Name, Fields, readonly []>>) => ValidOwnedOperationMap<Ops, EntityOperationContext<Name, Fields, readonly []>> & Ops;
}): EntityWithTraits<Name, Fields, readonly [], Ops>;
export declare function Entity<const Name extends string, Fields extends FieldMap, const Traits extends readonly AnyTrait[] = [], const Ops extends Readonly<Record<string, AnyUnboundOperation>> = {}>(name: ValidIdentName<Name>, fields: Fields & ValidFieldMap<Fields>, options: {
    readonly traits: Traits;
    readonly doc?: string;
    readonly operations: (Operation: OwnedOperationAuthor<EntityOperationContext<Name, Fields, Traits>>) => ValidOwnedOperationMap<Ops, EntityOperationContext<Name, Fields, Traits>> & Ops;
} & ValidTraitCompose<Fields, Traits>): EntityWithTraits<Name, Fields, Traits, Ops>;
export declare function Entity<const Name extends string, Fields extends FieldMap, const Traits extends readonly AnyTrait[] = []>(name: ValidIdentName<Name>, fields: Fields & ValidFieldMap<Fields>, options: {
    readonly traits?: Traits;
    readonly doc?: string;
    readonly operations?: never;
} & ValidTraitCompose<Fields, Traits>): EntityWithTraits<Name, Fields, Traits, {}>;
export type FieldOf<N extends AnyEntity, K extends keyof N["fields"]> = N["fields"][K];
export type IdentOf<N extends AnyEntity, K extends keyof N["fields"] & string> = N["fields"][K] extends {
    readonly ident: infer I extends string;
} ? I : `:${N["ns"]}/${K}`;
export {};
//# sourceMappingURL=Entity.d.ts.map