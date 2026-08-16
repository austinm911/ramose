/**
 * A typed attribute: a value `effect/Schema`, cardinality, and the
 * Datomic-shaped options Ripple already persists.
 *
 * The attribute's *name* is the key it is filed under in a {@link Namespace}.
 * The ident (`:user/name`) is derived there — not invented here — so the
 * wire form stays today's `:ns/attr`.
 */

import type * as Schema from "effect/Schema";
import type { DbValueType } from "./valueTypes.ts";

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

export interface Attribute<
  S extends Schema.Top = Schema.Top,
  Card extends Cardinality = Cardinality,
  Unique extends Uniqueness | undefined = Uniqueness | undefined,
> {
  readonly _tag: "Attribute";
  readonly schema: S;
  readonly cardinality: Card;
  readonly unique: Unique;
  readonly index: boolean;
  readonly isComponent: boolean;
  readonly doc: string | undefined;
  readonly valueType: DbValueType | undefined;
}

export type AnyAttribute = Attribute<
  Schema.Top,
  Cardinality,
  Uniqueness | undefined
>;

/**
 * Declare an attribute. File it under a namespace key to give it a name:
 *
 * ```ts
 * const name = attr(Schema.String, { unique: "identity" })
 * // Namespace("user", { name }) → ident :user/name
 * ```
 */
export const attr: {
  <S extends Schema.Top>(schema: S): Attribute<S, "one", undefined>;
  <S extends Schema.Top, const O extends AttributeOptions>(
    schema: S,
    options: O,
  ): Attribute<S, CardOf<O>, UniqueOf<O>>;
} = ((schema: Schema.Top, options?: AttributeOptions) => ({
  _tag: "Attribute" as const,
  schema,
  cardinality: options?.cardinality ?? "one",
  unique: options?.unique,
  index: options?.index ?? options?.unique !== undefined,
  isComponent: options?.isComponent ?? false,
  doc: options?.doc,
  valueType: options?.valueType,
})) as typeof attr;

export type ValueOf<A extends AnyAttribute> = Schema.Schema.Type<A["schema"]>;
