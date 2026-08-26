/**
 * The ident-name rule — public on `ramose/db` (issue #184).
 *
 * Entity names and field keys become the two sides of a `:ns/attr` ident.
 * A space or slash in either side used to install `":my ns/x/a b"`; a
 * catalog key that did not match `entity.ns` silently split policy
 * (`ns.todos`) from the wire (`:todo/*`). The same character class is
 * therefore checked at `Entity()` / `Schema()` definition time, and the
 * regex is exported so an app that generates a schema can check first.
 *
 * Contrast `DATABASE_NAME_RE`: a database name is a route segment (digits
 * and `.` allowed). An ident part is a keyword: it starts with a letter,
 * and `/` `.` `:` and whitespace are rejected so `:ns/attr` stays exactly
 * one slash.
 */
/**
 * One side of a `:ns/attr` ident — entity names and field keys.
 * Letter, then up to 63 letters / digits / `_` / `-` (64 characters total).
 */
export declare const IDENT_NAME_RE: RegExp;
/** Whether `name` is a valid entity name or field key ({@link IDENT_NAME_RE}). */
export declare const isIdentName: (name: string) => boolean;
/**
 * Keys `Entity()` stamps onto the record-type object. A user field of the
 * same name would overwrite metadata (`id` → every `select({ id: N.id })`
 * reads a string; `ns` → `install()` emits `:[object Object]/id`).
 */
export declare const RESERVED_FIELD_KEYS: readonly ["id", "ns", "fields", "_tag"];
/** A field key that collides with {@link Entity} metadata. */
export type ReservedFieldKey = (typeof RESERVED_FIELD_KEYS)[number];
/** Whether `name` is {@link Entity} metadata and cannot be a field key. */
export declare const isReservedFieldKey: (name: string) => name is ReservedFieldKey;
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type Lower = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m" | "n" | "o" | "p" | "q" | "r" | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z";
type Upper = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M" | "N" | "O" | "P" | "Q" | "R" | "S" | "T" | "U" | "V" | "W" | "X" | "Y" | "Z";
type Letter = Lower | Upper;
type IdentChar = Letter | Digit | "_" | "-";
type IsIdentRest<S extends string> = S extends "" ? true : S extends `${IdentChar}${infer Rest}` ? IsIdentRest<Rest> : false;
/** `true` when `S` is a valid ident part, or is wide `string` (runtime checks). */
export type IsIdentName<S extends string> = string extends S ? true : S extends `${Letter}${infer Rest}` ? IsIdentRest<Rest> : false;
type NameError<S, Msg extends string> = S & {
    readonly [K in Msg]: true;
};
declare const IDENT_NAME_MSG: "invalid name — must match IDENT_NAME_RE";
declare const RESERVED_FIELD_MSG: "reserved field name — id, ns, fields, and _tag are Entity metadata";
declare const SCHEMA_KEY_MSG: "Schema key must equal the Entity name";
declare const DUPLICATE_ENTITY_MSG: "duplicate entity name";
/** Entity / field name: the literal if valid, else a brand that fails assignability. */
export type ValidIdentName<S extends string> = IsIdentName<S> extends true ? S : NameError<S, typeof IDENT_NAME_MSG>;
type ReservedIn<F> = Extract<keyof F, ReservedFieldKey>;
type BadNamedIn<F> = {
    [K in keyof F]: K extends string ? K extends ReservedFieldKey ? never : IsIdentName<K> extends true ? never : K : never;
}[keyof F];
/**
 * Field map: unchanged when every key is a non-reserved ident part; otherwise
 * branded so the object literal is not assignable (same shape as
 * `InferableSchema`).
 */
export type ValidFieldMap<F> = [ReservedIn<F>] extends [never] ? [BadNamedIn<F>] extends [never] ? F : NameError<F, typeof IDENT_NAME_MSG> : NameError<F, typeof RESERVED_FIELD_MSG>;
type NsOf<E> = E extends {
    readonly ns: infer N extends string;
} ? N : never;
type KeyMatchesNs<K extends string, N extends string> = string extends N ? true : string extends K ? true : [K] extends [N] ? [N] extends [K] ? true : false : false;
/** Object-form schema: each key must be that entity's `ns`. */
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
/** Array-form schema: two entries with the same `ns` are a type error. */
export type ValidEntityList<Es extends readonly {
    readonly ns: string;
}[]> = HasDuplicate<NsTuple<Es>> extends true ? NameError<Es, typeof DUPLICATE_ENTITY_MSG> : Es;
/** `{ [entity.ns]: entity }` from `Schema([User, Label])`. */
export type EntitiesFromArray<Es extends readonly {
    readonly ns: string;
}[]> = {
    [E in Es[number] as E["ns"] & string]: E;
};
type Overlap<A, B> = keyof A & keyof B;
/**
 * `merge` right-hand schema: no entity name already present on the left.
 * Wide `EntityMap` (`string` keys — `Schema.Any`) defers to the runtime
 * check, matching `IsIdentName` / `KeyMatchesNs` / `HasDuplicate`.
 */
export type ValidMerge<A extends Record<string, unknown>, B extends Record<string, unknown>> = string extends keyof A ? B : string extends keyof B ? B : [Overlap<A, B>] extends [never] ? B : NameError<B, typeof DUPLICATE_ENTITY_MSG>;
export declare const invalidIdentName: (kind: "entity" | "field", name: string) => Error;
export declare const reservedFieldName: (name: string) => Error;
export declare const schemaKeyMismatch: (key: string, ns: string) => Error;
export declare const duplicateEntityName: (ns: string) => Error;
export declare const conflictingIdent: (ident: string) => Error;
export {};
//# sourceMappingURL=IdentName.d.ts.map