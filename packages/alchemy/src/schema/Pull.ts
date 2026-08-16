/**
 * Typed pull. Callers map catalog attrs onto the result keys they want.
 *
 * The happy path is a {@link Struct} — the same shape as `Schema.Struct`:
 * keys are the names that come back, values are attr refs (`User.name`)
 * or `optional` / `nested` wrappers. Required fields are `T`; optional
 * fields are `T | undefined`. A nested ref is an object, or an array
 * when the attr is cardinality-many.
 *
 * ```ts
 * const pulled = yield* db.pull(
 *   1001,
 *   Struct({
 *     name: User.name,
 *     age: optional(User.age),
 *     source: Meta.source,
 *     friends: nested(User.friends, Struct({ name: User.name })),
 *   }),
 * )
 * // pulled : {
 * //   readonly name: string
 * //   readonly age: number | undefined
 * //   readonly source: string
 * //   readonly friends: readonly { readonly name: string }[]
 * // } | null
 * ```
 *
 * Ident-keyed arrays (`[User.name, ":user/age"]`) stay as the keyword-soup
 * escape. Those results are still keyed by ident, and every field is
 * optional — that is what the engine returns.
 */

import type * as Schema from "effect/Schema";
import type { AnyAttribute } from "./Attribute.ts";
import type { AnyCatalog } from "./Catalog.ts";
import type { CatalogIdent, ReadAtIdent } from "./idents.ts";
import type { AttributeMap } from "./Namespace.ts";

// ── markers ────────────────────────────────────────────────────────────────

export interface PullStruct<
  F extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly _tag: "struct";
  readonly fields: F;
}

export interface PullOptional<F = unknown> {
  readonly _tag: "optional";
  readonly field: F;
}

export interface PullNested<A = unknown, P = unknown> {
  readonly _tag: "nested";
  readonly attr: A;
  readonly pattern: P;
}

/**
 * `Schema.Struct` for a pull. Keys are the result names; values are
 * attr refs, {@link optional}, or {@link nested}.
 */
export const Struct = <const F extends Record<string, unknown>>(
  fields: F,
): PullStruct<F> => ({
  _tag: "struct",
  fields,
});

/** Mark a field maybe-missing. The result type is `T | undefined`. */
export const optional = <const F>(field: F): PullOptional<F> => ({
  _tag: "optional",
  field,
});

/**
 * Follow a ref (or cardinality-many refs) and pull a nested struct.
 * The attr must be a `:db.type/ref` (`valueType: ":db.type/ref"`).
 * Card-one → object; card-many → `readonly T[]`.
 */
export const nested = <
  const A extends { readonly valueType: ":db.type/ref" },
  const P extends Record<string, unknown> | PullStruct<Record<string, unknown>>,
>(
  attr: A,
  pattern: P,
): PullNested<A, P> => ({
  _tag: "nested",
  attr,
  pattern,
});

/**
 * `Schema.pick` for a namespace: result keys are the attribute names,
 * all required. Mix namespaces or rename with {@link Struct}.
 *
 * ```ts
 * pick(User, "name", "age")
 * // Struct({ name: User.name, age: User.age })
 * ```
 */
export const pick = <
  const N extends { readonly attributes: AttributeMap },
  const Keys extends readonly (keyof N["attributes"] & string)[],
>(
  ns: N,
  ...keys: Keys
): PullStruct<{
  readonly [K in Keys[number]]: N["attributes"][K];
}> => {
  const fields = {} as Record<string, AnyAttribute>;
  for (const key of keys) fields[key] = ns.attributes[key]!;
  return Struct(fields) as PullStruct<{
    readonly [K in Keys[number]]: N["attributes"][K];
  }>;
};

export const isPullStruct = (value: unknown): value is PullStruct =>
  typeof value === "object" &&
  value !== null &&
  (value as { _tag?: unknown })._tag === "struct" &&
  "fields" in value;

export const isPullOptional = (value: unknown): value is PullOptional =>
  typeof value === "object" &&
  value !== null &&
  (value as { _tag?: unknown })._tag === "optional" &&
  "field" in value;

export const isPullNested = (value: unknown): value is PullNested =>
  typeof value === "object" &&
  value !== null &&
  (value as { _tag?: unknown })._tag === "nested" &&
  "attr" in value &&
  "pattern" in value;

// ── result types ───────────────────────────────────────────────────────────

type SchemaType<S> = S extends Schema.Top ? Schema.Schema.Type<S> : never;

type ScalarResult<F> = F extends {
  readonly schema: infer S;
  readonly cardinality: infer Card;
}
  ? Card extends "many"
    ? readonly SchemaType<S>[]
    : SchemaType<S>
  : never;

type PatternFields<P> = P extends PullStruct<infer F> ? F : P;

type FieldsResult<F> = {
  readonly [K in keyof F]: FieldResult<F[K]>;
};

type NestedResult<A, P> = A extends { readonly cardinality: "many" }
  ? readonly FieldsResult<PatternFields<P>>[]
  : FieldsResult<PatternFields<P>>;

type FieldResult<F> = F extends PullOptional<infer Inner>
  ? FieldResult<Inner> | undefined
  : F extends PullNested<infer A, infer P>
    ? NestedResult<A, P>
    : ScalarResult<F>;

/** Result shape of a {@link Struct} (or a bare fields object). */
export type StructPullResult<P> = P extends PullStruct<infer F>
  ? FieldsResult<F>
  : FieldsResult<P>;

// ── ident-keyed escape ─────────────────────────────────────────────────────

/**
 * One slot in the keyword-soup pull. Attr ref (`User.name`), catalog
 * ident (`":user/name"`), or wildcard.
 */
export type IdentPullAttr<C extends AnyCatalog> =
  | CatalogIdent<C>
  | { readonly ident: CatalogIdent<C> }
  | "*";

export type IdentPullPattern<C extends AnyCatalog> = readonly IdentPullAttr<C>[];

type IdentOfPull<C extends AnyCatalog, A> = A extends "*"
  ? "*"
  : A extends { readonly ident: infer I extends string }
    ? I
    : A extends CatalogIdent<C>
      ? A
      : never;

export type IdentPullIdents<
  C extends AnyCatalog,
  P extends IdentPullPattern<C>,
> = IdentOfPull<C, P[number]>;

export type IdentPullResult<
  C extends AnyCatalog,
  P extends IdentPullPattern<C>,
> = "*" extends IdentPullIdents<C, P>
  ? {
      readonly ":db/id": number;
    } & {
      readonly [I in CatalogIdent<C>]?: ReadAtIdent<C, I>;
    }
  : {
      readonly ":db/id"?: number;
    } & {
      readonly [I in IdentPullIdents<C, P> & CatalogIdent<C>]?: ReadAtIdent<
        C,
        I
      >;
    };

// ── catalog constraint ─────────────────────────────────────────────────────

/**
 * Walk a pull pattern and collect every ident it names (attr refs,
 * ident strings, nested / optional wrappers). Used to reject attrs
 * that are not in the catalog without a recursive field union —
 * those blow the client type (`Type instantiation is excessively deep`).
 */
type IdentsIn<P> = [P] extends [PullStruct<infer F>]
  ? IdentsInFields<F>
  : [P] extends [PullOptional<infer I>]
    ? IdentsIn<I>
    : [P] extends [PullNested<infer A, infer Inner>]
      ? IdentsIn<A> | IdentsIn<Inner>
      : [P] extends [{ readonly ident: infer I extends string }]
        ? I
        : [P] extends [readonly unknown[]]
          ? IdentsInArray<P[number]>
          : [P] extends [object]
            ? IdentsInFields<P>
            : never;

/** Ident strings are only idents in the array escape, not on attr objects. */
type IdentsInArray<E> = [E] extends [string] ? E : IdentsIn<E>;

type IdentsInFields<F> = F extends object
  ? { [K in keyof F]: IdentsIn<F[K]> }[keyof F]
  : never;

/**
 * `P` when every named ident is in the catalog (or `*`); otherwise a
 * string literal so the call is a type error.
 */
export type ValidatePull<C extends AnyCatalog, P> = [IdentsIn<P>] extends [
  CatalogIdent<C> | "*",
]
  ? P
  : "unknown attribute in pull pattern";

/**
 * Inferred result of `db.pull(eid, pattern)`. Struct / fields → caller
 * keys, required vs optional honored. Array → ident keys, all optional.
 */
export type PullResult<C extends AnyCatalog, P> = [P] extends [
  readonly unknown[],
]
  ? P extends IdentPullPattern<C>
    ? IdentPullResult<C, P>
    : never
  : StructPullResult<P>;

/** @deprecated Use {@link IdentPullAttr}. */
export type PullAttr<C extends AnyCatalog> = IdentPullAttr<C>;

/** @deprecated Array form only. Prefer {@link Struct}. */
export type PullPattern<C extends AnyCatalog> = IdentPullPattern<C>;
