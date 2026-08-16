/**
 * Typed pull. The pattern is a plain object: keys are the names that
 * come back, values are attr refs. Same syntax at every level.
 *
 * ```ts
 * const pulled = yield* eid.pull({
 *   name: User.name,
 *   age: User.age.optional,
 *   source: Meta.source,
 *   bestFriend: User.bestFriend.optional.with({
 *     name: User.name,
 *     age: User.age.optional,
 *   }),
 *   friends: User.friends.with({
 *     name: User.name,
 *     age: User.age.optional,
 *   }),
 * })
 * // name: string
 * // age: number | undefined
 * // bestFriend: { name: string; age: number | undefined } | undefined
 * // friends: readonly { name: string; age: number | undefined }[]
 * ```
 *
 * A bare attr ref is required (`T`). `.optional` is maybe
 * (`T | undefined`). `.with({ ... })` follows a ref — object if
 * card-one, `readonly T[]` if many. Mix namespaces on one map.
 *
 * Ident-keyed arrays (`[User.name, ":user/age"]`) stay as the
 * keyword-soup escape — those results are keyed by ident, and every
 * field is optional.
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
  /**
   * Nested pull, then maybe. Only on refs
   * (`valueType: ":db.type/ref"`). Non-refs type this as `never`.
   */
  readonly with: F extends { readonly valueType: ":db.type/ref" }
    ? <const P extends Record<string, unknown>>(
        pattern: P,
      ) => PullOptional<PullNested<F, P>>
    : never;
}

export interface PullNested<A = unknown, P = unknown> {
  readonly _tag: "nested";
  readonly attr: A;
  readonly pattern: P;
  /** The whole nested value is maybe (`T | undefined`). */
  readonly optional: PullOptional<PullNested<A, P>>;
}

/**
 * Literate pull methods stamped onto every attr ref (`User.name`).
 * `.with` is only callable on `:db.type/ref` attrs.
 */
export type AttrPull<A> = {
  readonly optional: PullOptional<A>;
  readonly with: A extends { readonly valueType: ":db.type/ref" }
    ? <const P extends Record<string, unknown>>(pattern: P) => PullNested<A, P>
    : never;
};

/** Internal: implements `attr.optional`. The result type is `T | undefined`. */
export const optional = <const F>(field: F): PullOptional<F> => {
  const wrap: PullOptional<F> = {
    _tag: "optional",
    field,
    with: ((pattern: Record<string, unknown>) =>
      optional(nested(field as never, pattern))) as unknown as PullOptional<
      F
    >["with"],
  };
  return wrap;
};

/**
 * Internal: implements `attr.with({ ... })`. Follow a ref (or
 * cardinality-many refs) and pull a nested map. The attr must be a
 * `:db.type/ref`. Card-one → object; card-many → `readonly T[]`.
 */
export const nested = <
  const A extends { readonly valueType: ":db.type/ref" },
  const P extends Record<string, unknown> | PullStruct<Record<string, unknown>>,
>(
  attr: A,
  pattern: P,
): PullNested<A, P> => {
  const result: PullNested<A, P> = {
    _tag: "nested",
    attr,
    pattern,
    get optional() {
      return optional(result);
    },
  };
  return result;
};

/**
 * `Schema.pick` for a namespace: result keys are the attribute names,
 * all required. Mix namespaces or rename with a plain object.
 *
 * ```ts
 * pick(User, "name", "age")
 * // { name: User.name, age: User.age }
 * ```
 */
export const pick = <
  const N extends { readonly attributes: AttributeMap },
  const Keys extends readonly (keyof N["attributes"] & string)[],
>(
  ns: N,
  ...keys: Keys
): {
  readonly [K in Keys[number]]: N["attributes"][K];
} => {
  const fields = {} as Record<string, AnyAttribute>;
  for (const key of keys) fields[key] = ns.attributes[key]!;
  return fields as {
    readonly [K in Keys[number]]: N["attributes"][K];
  };
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

/** Result shape of a fields object. */
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
 * Inferred result of `eid.pull(pattern)`. Fields object → caller
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

/** @deprecated Array form only. Prefer a plain fields object. */
export type PullPattern<C extends AnyCatalog> = IdentPullPattern<C>;
