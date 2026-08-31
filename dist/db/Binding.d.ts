import type { AnyField, CreationDefault, ValueOf } from "./Field.ts";
import type { AnySchema } from "./Schema.ts";
/** Minimal permanently-keyed code definition understood by reachability. */
export interface CodeDefinition {
    readonly key: string;
    readonly schema: AnySchema;
}
/** Lazy form permits self-similar and mutually recursive catalog graphs. */
export type CodeDefinitionRef = CodeDefinition | (() => CodeDefinition);
type BoundFieldValue<F extends AnyField> = F["cardinality"] extends "many" ? readonly ValueOf<F>[] : ValueOf<F>;
export type BindingValues<Fields extends Record<string, AnyField>> = {
    readonly [K in keyof Fields]?: BoundFieldValue<Fields[K]>;
};
export type BindingDefaults<Fields extends Record<string, AnyField>> = {
    readonly [K in keyof Fields]?: CreationDefault<BoundFieldValue<Fields[K]>>;
};
/** Inert result of a trait's `bind` function. */
export interface TraitBindingSpec<Fields extends Record<string, AnyField> = Record<string, AnyField>> {
    readonly values?: BindingValues<Fields>;
    readonly defaults?: BindingDefaults<Fields>;
    readonly dependencies?: readonly CodeDefinitionRef[];
}
export type TraitBind<Fields extends Record<string, AnyField> = Record<string, AnyField>> = (definition: CodeDefinition) => TraitBindingSpec<Fields>;
export declare const TRAIT_BINDING: unique symbol;
export declare const TRAIT_BIND_FACTORY: unique symbol;
type SpecOf<B> = B extends (...args: infer _Args) => infer S ? S : never;
type SelectedOf<S, K extends PropertyKey> = S extends unknown ? K extends keyof S ? Exclude<S[K], undefined> : {} : never;
type KeysOfUnion<T> = T extends unknown ? keyof T : never;
type ValuesOf<B> = SelectedOf<SpecOf<B>, "values">;
type DefaultsOf<B> = SelectedOf<SpecOf<B>, "defaults">;
type BoundField<F, K extends PropertyKey, B> = K extends KeysOfUnion<ValuesOf<B>> ? F & {
    readonly fixed: true;
} : K extends KeysOfUnion<DefaultsOf<B>> ? F & {
    readonly compositionDefault: true;
} : F;
export type BoundFieldMap<Fields extends Readonly<Record<string, AnyField>>, B> = {
    readonly [K in keyof Fields]: BoundField<Fields[K], K, B>;
};
type BoundFields<T extends TraitLike, B> = BoundFieldMap<T["fields"], B>;
export type TraitLike = {
    readonly _tag: "Trait";
    readonly ns: string;
    readonly fields: Readonly<Record<string, AnyField & {
        readonly ident: string;
    }>>;
    readonly traits: readonly {
        readonly ns: string;
    }[];
};
type FieldKeys<T extends TraitLike> = keyof T["fields"];
/** One use of a bindable trait. Trait identity remains the underlying trait. */
export type TraitBinding<T extends TraitLike = TraitLike, B extends TraitBind = TraitBind> = Omit<T, FieldKeys<T> | "fields"> & BoundFields<T, B> & {
    readonly fields: BoundFields<T, B>;
    readonly [TRAIT_BINDING]: TraitBindingRuntime<T, B>;
};
export type BindableTrait<T extends TraitLike, B extends TraitBind> = T & ((definition: CodeDefinitionRef) => TraitBinding<T, B>) & {
    readonly [TRAIT_BIND_FACTORY]: B;
};
export interface TraitBindingRuntime<T extends TraitLike = TraitLike, B extends TraitBind = TraitBind> {
    readonly trait: T;
    readonly definition: CodeDefinitionRef;
    readonly bind: B;
}
export interface ResolvedTraitBinding {
    readonly trait: TraitLike;
    readonly definition: CodeDefinition;
    readonly values: Readonly<Record<string, unknown>>;
    readonly defaults: Readonly<Record<string, CreationDefault<unknown>>>;
    readonly dependencies: readonly CodeDefinition[];
}
export declare const cloneBindingValue: (value: unknown, seen?: WeakSet<object>) => unknown;
export declare const isCodeDefinition: (value: unknown) => value is CodeDefinition;
export declare const resolveCodeDefinition: (ref: CodeDefinitionRef) => CodeDefinition;
export declare const bindingOf: (value: unknown) => TraitBindingRuntime | undefined;
export declare const resolveTraitBinding: (runtime: TraitBindingRuntime) => ResolvedTraitBinding;
export declare const isBindableTrait: (value: unknown) => boolean;
export declare const traitDefinitionOf: (value: TraitLike) => TraitLike;
export declare const makeTraitBinding: <T extends TraitLike, B extends TraitBind>(trait: T, definition: CodeDefinitionRef, bind: B) => TraitBinding<T, B>;
export declare const makeBindableTrait: <T extends TraitLike, B extends TraitBind>(trait: T, bind: B) => BindableTrait<T, B>;
export {};
//# sourceMappingURL=Binding.d.ts.map