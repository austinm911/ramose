import { type BindableTrait, type BoundFieldMap, type TraitBind } from "./Binding.ts";
import { type FieldMap, type StampedMap } from "./Entity.ts";
import type { AnyField } from "./Field.ts";
import { type AttrNav, type PathCarrier } from "./shapes.ts";
import { type FlattenedTraitFields, type ValidFieldMap, type ValidIdentName, type ValidTraitCompose } from "./IdentName.ts";
import { OwnedOperations, type AnyUnboundOperation, type BoundOwnerOperations, type OwnedOperationAuthor, type ValidOwnedOperationMap } from "./Operation.ts";
export type TraitOptions<Traits extends readonly AnyTrait[] = readonly AnyTrait[]> = {
    readonly traits?: Traits;
    readonly doc?: string;
};
export type BindableTraitOptions<Fields extends FieldMap, Traits extends readonly AnyTrait[], Bind extends TraitBind<Fields>> = TraitOptions<Traits> & {
    readonly bind: Bind;
};
/**
 * Stamped fields plus metadata. Address a field as `Taggable.tag`.
 * `fields` is the iteration map — not a second public handle. Trait
 * fields keep this trait's ident (`:taggable/tag`) when flattened onto
 * a composer.
 */
export type Trait<Name extends string = string, Fields extends FieldMap = FieldMap, Ops extends Readonly<Record<string, AnyUnboundOperation>> = {}> = {
    readonly _tag: "Trait";
    readonly ns: Name;
    readonly fields: StampedMap<Name, Fields>;
    readonly traits: readonly {
        readonly ns: string;
    }[];
    readonly id: AttrNav<AnyField & {
        readonly schema: {
            readonly Type: number;
        };
        readonly attrName: "id";
        readonly ident: ":db/id";
        readonly valueType: "ref";
        readonly cardinality: "one";
        readonly _ns?: Trait<Name, Fields>;
    } & PathCarrier>;
    readonly [OwnedOperations]: BoundOwnerOperations<Trait<Name, Fields, Ops>, Ops>;
} & StampedMap<Name, Fields>;
/**
 * Bound for trait-generic helpers. `fields` is a wide record so a
 * composer with flattened trait fields stays assignable — `StampedMap`
 * would demand `orDefault(unknown)` and reject specific field refs.
 */
export type AnyTrait = {
    readonly _tag: "Trait";
    readonly ns: string;
    readonly fields: {
        readonly [key: string]: AnyField & {
            readonly ident: string;
        };
    };
    readonly traits: readonly {
        readonly ns: string;
    }[];
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
export declare namespace Trait {
    type Any = AnyTrait;
}
type TraitWithTraits<Name extends string, Fields extends FieldMap, Traits extends readonly AnyTrait[], Ops extends Readonly<Record<string, AnyUnboundOperation>>> = Trait<Name, Fields, Ops> & FlattenedTraitFields<Traits> & {
    readonly fields: StampedMap<Name, Fields> & FlattenedTraitFields<Traits>;
    readonly traits: Traits;
    readonly [OwnedOperations]: BoundOwnerOperations<Trait<Name, Fields, Ops> & {
        readonly fields: StampedMap<Name, Fields> & FlattenedTraitFields<Traits>;
        readonly traits: Traits;
    }, Ops>;
};
type TraitOperationContext<Name extends string, Fields extends FieldMap, Traits extends readonly AnyTrait[]> = {
    readonly _tag: "Trait";
    readonly ns: Name;
    readonly fields: StampedMap<Name, Fields> & FlattenedTraitFields<Traits>;
    readonly traits: Traits;
};
type BindableTraitOperationContext<Name extends string, Fields extends FieldMap, Traits extends readonly AnyTrait[], Bind extends TraitBind<Fields>> = {
    readonly _tag: "Trait";
    readonly ns: Name;
    readonly fields: BoundFieldMap<StampedMap<Name, Fields>, Bind> & FlattenedTraitFields<Traits>;
    readonly traits: Traits;
};
type BindableTraitOperationOwner<Name extends string, Fields extends FieldMap, Traits extends readonly AnyTrait[], Bind extends TraitBind<Fields>> = BindableTraitOperationContext<Name, Fields, Traits, Bind> & Pick<Trait<Name, Fields>, "id"> & {
    readonly [OwnedOperations]?: Readonly<Record<string, unknown>>;
};
type BindableTraitWithOperations<Name extends string, Fields extends FieldMap, Traits extends readonly AnyTrait[], Bind extends TraitBind<Fields>, Ops extends Readonly<Record<string, AnyUnboundOperation>>> = BindableTrait<Omit<TraitWithTraits<Name, Fields, Traits, Ops>, typeof OwnedOperations> & {
    readonly [OwnedOperations]: BoundOwnerOperations<BindableTraitOperationOwner<Name, Fields, Traits, Bind>, Ops>;
}, Bind>;
/** Group fields under one ident prefix, optionally composing other traits. */
export declare function Trait<const Name extends string, Fields extends FieldMap>(name: ValidIdentName<Name>, fields: Fields & ValidFieldMap<Fields>): Trait<Name, Fields>;
export declare function Trait<const Name extends string, Fields extends FieldMap, const Bind extends TraitBind<Fields>, const Ops extends Readonly<Record<string, AnyUnboundOperation>> = {}>(name: ValidIdentName<Name>, fields: Fields & ValidFieldMap<Fields>, options: {
    readonly traits?: never;
    readonly doc?: string;
    readonly bind: Bind;
    readonly operations: (Operation: OwnedOperationAuthor<BindableTraitOperationContext<Name, Fields, readonly [], Bind>>) => ValidOwnedOperationMap<Ops, BindableTraitOperationContext<Name, Fields, readonly [], Bind>> & Ops;
}): BindableTraitWithOperations<Name, Fields, readonly [], Bind, Ops>;
export declare function Trait<const Name extends string, Fields extends FieldMap, const Bind extends TraitBind<Fields>, const Traits extends readonly AnyTrait[] = [], const Ops extends Readonly<Record<string, AnyUnboundOperation>> = {}>(name: ValidIdentName<Name>, fields: Fields & ValidFieldMap<Fields>, options: {
    readonly traits: Traits;
    readonly doc?: string;
    readonly bind: Bind;
    readonly operations: (Operation: OwnedOperationAuthor<BindableTraitOperationContext<Name, Fields, Traits, Bind>>) => ValidOwnedOperationMap<Ops, BindableTraitOperationContext<Name, Fields, Traits, Bind>> & Ops;
} & ValidTraitCompose<Fields, Traits>): BindableTraitWithOperations<Name, Fields, Traits, Bind, Ops>;
export declare function Trait<const Name extends string, Fields extends FieldMap, const Bind extends TraitBind<Fields>, const Traits extends readonly AnyTrait[] = []>(name: ValidIdentName<Name>, fields: Fields & ValidFieldMap<Fields>, options: BindableTraitOptions<Fields, Traits, Bind> & {
    readonly operations?: never;
} & ValidTraitCompose<Fields, Traits>): BindableTrait<TraitWithTraits<Name, Fields, Traits, {}>, Bind>;
export declare function Trait<const Name extends string, Fields extends FieldMap, const Ops extends Readonly<Record<string, AnyUnboundOperation>> = {}>(name: ValidIdentName<Name>, fields: Fields & ValidFieldMap<Fields>, options: {
    readonly traits?: never;
    readonly bind?: never;
    readonly doc?: string;
    readonly operations: (Operation: OwnedOperationAuthor<TraitOperationContext<Name, Fields, readonly []>>) => ValidOwnedOperationMap<Ops, TraitOperationContext<Name, Fields, readonly []>> & Ops;
}): TraitWithTraits<Name, Fields, readonly [], Ops>;
export declare function Trait<const Name extends string, Fields extends FieldMap, const Traits extends readonly AnyTrait[] = [], const Ops extends Readonly<Record<string, AnyUnboundOperation>> = {}>(name: ValidIdentName<Name>, fields: Fields & ValidFieldMap<Fields>, options: {
    readonly traits: Traits;
    readonly doc?: string;
    readonly operations: (Operation: OwnedOperationAuthor<TraitOperationContext<Name, Fields, Traits>>) => ValidOwnedOperationMap<Ops, TraitOperationContext<Name, Fields, Traits>> & Ops;
} & ValidTraitCompose<Fields, Traits>): TraitWithTraits<Name, Fields, Traits, Ops>;
export declare function Trait<const Name extends string, Fields extends FieldMap, const Traits extends readonly AnyTrait[] = []>(name: ValidIdentName<Name>, fields: Fields & ValidFieldMap<Fields>, options: {
    readonly traits?: Traits;
    readonly doc?: string;
    readonly operations?: never;
} & ValidTraitCompose<Fields, Traits>): TraitWithTraits<Name, Fields, Traits, {}>;
export {};
//# sourceMappingURL=Trait.d.ts.map