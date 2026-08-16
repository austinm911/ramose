/**
 * A typed attribute: a value `effect/Schema`, cardinality, and the
 * Datomic-shaped options Ripple already persists.
 *
 * The attribute's *name* is the key it is filed under in a {@link Namespace}.
 * The ident (`:user/name`) is derived there — not invented here — so the
 * wire form stays today's `:ns/attr`.
 */

import type * as Schema from "effect/Schema";
import {
  tryInferDbValueType,
  type DbValueType,
  type InferDbValueType,
} from "./valueTypes.ts";

export type Cardinality = "one" | "many";
export type Uniqueness = "identity" | "value";

export interface AttributeOptions {
  readonly cardinality?: Cardinality;
  readonly unique?: Uniqueness;
  readonly index?: boolean;
  readonly isComponent?: boolean;
  readonly doc?: string;
  /**
   * Override `:db.type/*` inference. Required when the value Schema is not
   * a primitive or one of the helpers in `valueTypes.ts`.
   *
   * Captured as a type parameter so `User.friends.with({ ... })` / `nested`
   * can require a ref (`valueType: ":db.type/ref"`) without a
   * parallel schema language.
   */
  readonly valueType?: DbValueType;
}

type CardOf<O> = [O] extends [{ readonly cardinality: infer C }]
  ? C extends Cardinality
    ? C
    : "one"
  : "one";

type UniqueOf<O> = [O] extends [{ readonly unique: infer U }]
  ? U extends Uniqueness
    ? U
    : undefined
  : undefined;

type ValueTypeOf<S, O> = [O] extends [{ readonly valueType: infer V }]
  ? V extends DbValueType
    ? V
    : InferDbValueType<S>
  : InferDbValueType<S>;

export interface Attribute<
  S extends Schema.Top = Schema.Top,
  Card extends Cardinality = Cardinality,
  Unique extends Uniqueness | undefined = Uniqueness | undefined,
  VT extends DbValueType | undefined = DbValueType | undefined,
> {
  readonly _tag: "Attribute";
  readonly schema: S;
  readonly cardinality: Card;
  readonly unique: Unique;
  readonly index: boolean;
  readonly isComponent: boolean;
  readonly doc: string | undefined;
  readonly valueType: VT;
}

export type AnyAttribute = Attribute<
  Schema.Top,
  Cardinality,
  Uniqueness | undefined,
  DbValueType | undefined
>;

/**
 * Declare an attribute. File it under a namespace key to give it a name:
 *
 * ```ts
 * const name = Attr(Schema.String, { unique: "identity" })
 * const age = Attr(Long)
 * const friends = Attr(Ref, { cardinality: "many" })
 * // Namespace("user", { name, age, friends }) → :user/name, …
 * ```
 *
 * Constructors are `Namespace`, `Catalog`, `Attr`. `:db.type/*` is
 * inferred from the Schema (`Long` → long, `Ref` → ref, `Schema.String`
 * → string, `Schema.Number` → double, `Schema.Boolean` → boolean).
 */
export const Attr: {
  <S extends Schema.Top>(
    schema: S,
  ): Attribute<S, "one", undefined, InferDbValueType<S>>;
  <S extends Schema.Top, const O extends AttributeOptions>(
    schema: S,
    options: O,
  ): Attribute<S, CardOf<O>, UniqueOf<O>, ValueTypeOf<S, O>>;
} = ((schema: Schema.Top, options?: AttributeOptions) => ({
  _tag: "Attribute" as const,
  schema,
  cardinality: options?.cardinality ?? "one",
  unique: options?.unique,
  index: options?.index ?? options?.unique !== undefined,
  isComponent: options?.isComponent ?? false,
  doc: options?.doc,
  valueType: tryInferDbValueType(schema, options?.valueType),
})) as typeof Attr;

export type ValueOf<A extends AnyAttribute> = Schema.Schema.Type<A["schema"]>;
