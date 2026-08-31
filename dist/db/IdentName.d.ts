/**
 * One side of a `:ns/attr` ident — entity names and field keys.
 * Letter, then up to 63 letters / digits / `_` / `-` (64 characters total).
 */
export declare const IDENT_NAME_RE: RegExp;
/** Whether `name` is a valid entity name or field key ({@link IDENT_NAME_RE}). */
export declare const isIdentName: (name: string) => boolean;
/**
 * Keys `Entity()` / `Trait()` stamp onto the record-type object. A user
 * field of the same name would overwrite metadata (`id` → every
 * `select({ id: N.id })` reads a string; `ns` → `install()` emits
 * `:[object Object]/id`; `traits` → composition is lost).
 */
export declare const RESERVED_FIELD_KEYS: readonly ["id", "ns", "fields", "_tag", "traits"];
export type ReservedFieldKey = (typeof RESERVED_FIELD_KEYS)[number];
/** Whether `name` is {@link Entity} metadata and cannot be a field key. */
export declare const isReservedFieldKey: (name: string) => name is ReservedFieldKey;
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type Lower = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m" | "n" | "o" | "p" | "q" | "r" | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z";
type Upper = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M" | "N" | "O" | "P" | "Q" | "R" | "S" | "T" | "U" | "V" | "W" | "X" | "Y" | "Z";
type Letter = Lower | Upper;
type IdentChar = Letter | Digit | "_" | "-";
type IsIdentRest<S extends string> = S extends "" ? true : S extends `${IdentChar}${infer Rest}` ? IsIdentRest<Rest> : false;
export type IsIdentName<S extends string> = string extends S ? true : S extends `${Letter}${infer Rest}` ? IsIdentRest<Rest> : false;
type NameError<S, Msg extends string> = S & {
    readonly [K in Msg]: true;
};
declare const IDENT_NAME_MSG: "invalid name — must match IDENT_NAME_RE";
declare const RESERVED_FIELD_MSG: "reserved field name — id, ns, fields, _tag, and traits are Entity / Trait metadata";
declare const TRAIT_COLLISION_MSG: "conflicting flattened field names";
declare const SCHEMA_KEY_MSG: "Schema key must equal the Entity name";
declare const DUPLICATE_ENTITY_MSG: "duplicate entity name";
export type ValidIdentName<S extends string> = IsIdentName<S> extends true ? S : NameError<S, typeof IDENT_NAME_MSG>;
type ReservedIn<F> = Extract<keyof F, ReservedFieldKey>;
type BadNamedIn<F> = {
    [K in keyof F]: K extends string ? K extends ReservedFieldKey ? never : IsIdentName<K> extends true ? never : K : never;
}[keyof F];
export type ValidFieldMap<F> = [ReservedIn<F>] extends [never] ? [BadNamedIn<F>] extends [never] ? F : NameError<F, typeof IDENT_NAME_MSG> : NameError<F, typeof RESERVED_FIELD_MSG>;
type NsOf<E> = E extends {
    readonly ns: infer N extends string;
} ? N : never;
type KeyMatchesNs<K extends string, N extends string> = string extends N ? true : string extends K ? true : [K] extends [N] ? [N] extends [K] ? true : false : false;
export type ValidEntityMap<Es extends Record<string, {
    readonly ns: string;
}>> = {
    [K in keyof Es]: K extends string ? KeyMatchesNs<K, Es[K]["ns"]> extends true ? Es[K] : NameError<Es[K], typeof SCHEMA_KEY_MSG> : Es[K];
};
type NsTuple<Es extends readonly {
    readonly ns: string;
}[]> = {
    [I in keyof Es]: NsOf<Es[I]>;
};
type HasDuplicate<T extends readonly unknown[], Seen extends PropertyKey = never> = T extends readonly [infer H, ...infer R] ? string extends H ? HasDuplicate<R, Seen> : H extends Seen ? true : H extends PropertyKey ? HasDuplicate<R, Seen | H> : HasDuplicate<R, Seen> : false;
export type ValidEntityList<Es extends readonly {
    readonly ns: string;
}[]> = HasDuplicate<NsTuple<Es>> extends true ? NameError<Es, typeof DUPLICATE_ENTITY_MSG> : Es;
export type EntitiesFromArray<Es extends readonly {
    readonly ns: string;
}[]> = {
    [E in Es[number] as E["ns"] & string]: E;
};
type Overlap<A, B> = keyof A & keyof B;
export type ValidMerge<A extends Record<string, unknown>, B extends Record<string, unknown>> = string extends keyof A ? B : string extends keyof B ? B : [Overlap<A, B>] extends [never] ? B : NameError<B, typeof DUPLICATE_ENTITY_MSG>;
export declare const invalidIdentName: (kind: "entity" | "field" | "trait" | "operation", name: string) => Error;
export declare const reservedFieldName: (name: string) => Error;
type FieldIdent<F> = F extends {
    readonly ident: infer I extends string;
} ? I : never;
type FieldCollision<K extends string> = {
    readonly [P in `conflicting flattened field ${K}`]: true;
};
type MergeFieldMaps<A, B> = [keyof A & keyof B] extends [never] ? A & B : {
    [K in keyof A | keyof B]: K extends keyof A ? K extends keyof B ? FieldIdent<A[K]> extends FieldIdent<B[K]> ? FieldIdent<B[K]> extends FieldIdent<A[K]> ? A[K] : FieldCollision<K & string> : FieldCollision<K & string> : A[K] : K extends keyof B ? B[K] : never;
};
type NestedTraits<H> = H extends {
    readonly traits: infer T extends readonly unknown[];
} ? T : [];
export type FlattenedTraitFields<Traits extends readonly unknown[]> = Traits extends readonly [infer H, ...infer R] ? H extends {
    readonly fields: infer F extends object;
} ? MergeFieldMaps<MergeFieldMaps<F, FlattenedTraitFields<NestedTraits<H>>>, FlattenedTraitFields<R>> : FlattenedTraitFields<R> : {};
type CollisionBrandKey<T> = {
    [K in keyof T]: T[K] extends {
        readonly [P in `conflicting flattened field ${string}`]: true;
    } ? K : never;
}[keyof T];
type HasFieldCollision<T> = [CollisionBrandKey<T>] extends [never] ? false : true;
export type ValidTraitCompose<Fields, Traits extends readonly unknown[]> = HasFieldCollision<MergeFieldMaps<Fields, FlattenedTraitFields<Traits>>> extends true ? {
    readonly traits?: NameError<Traits, typeof TRAIT_COLLISION_MSG>;
} : unknown;
export declare const schemaKeyMismatch: (key: string, ns: string) => Error;
export declare const duplicateEntityName: (ns: string) => Error;
export declare const conflictingIdent: (ident: string) => Error;
export {};
//# sourceMappingURL=IdentName.d.ts.map