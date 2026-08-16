/**
 * A named group of attributes. The namespace name is the ident prefix:
 * `Namespace("user", { name })` derives `:user/name`.
 */

import type { AnyAttribute, Attribute } from "./Attribute.ts";

export type AttributeMap = Record<string, AnyAttribute>;

export type StampedAttribute<
  Ns extends string,
  Name extends string,
  A extends AnyAttribute,
> = A & {
  readonly name: Name;
  readonly ident: `:${Ns}/${Name}`;
};

export type StampedAttributes<
  Ns extends string,
  Attrs extends AttributeMap,
> = {
  readonly [K in keyof Attrs]: StampedAttribute<Ns, K & string, Attrs[K]>;
};

export interface Namespace<
  Name extends string = string,
  Attrs extends AttributeMap = AttributeMap,
> {
  readonly _tag: "Namespace";
  readonly name: Name;
  readonly attributes: StampedAttributes<Name, Attrs>;
}

export type AnyNamespace = Namespace<string, AttributeMap>;

const stamp = <Name extends string, Attrs extends AttributeMap>(
  name: Name,
  attributes: Attrs,
): StampedAttributes<Name, Attrs> => {
  const out: Record<string, AnyAttribute & { name: string; ident: string }> =
    {};
  for (const key of Object.keys(attributes)) {
    const a = attributes[key]!;
    out[key] = {
      ...a,
      name: key,
      ident: `:${name}/${key}`,
    };
  }
  return out as StampedAttributes<Name, Attrs>;
};

/**
 * Group attributes under one ident prefix.
 *
 * ```ts
 * const User = Namespace("user", {
 *   name: attr(Schema.String, { unique: "identity" }),
 *   age: attr(Schema.Number),
 * })
 * User.attributes.name.ident // ":user/name"
 * ```
 */
export const Namespace = <
  const Name extends string,
  Attrs extends AttributeMap,
>(
  name: Name,
  attributes: Attrs,
): Namespace<Name, Attrs> => ({
  _tag: "Namespace",
  name,
  attributes: stamp(name, attributes),
});

export type AttrOf<
  N extends AnyNamespace,
  K extends keyof N["attributes"],
> = N["attributes"][K];

export type IdentOf<
  N extends AnyNamespace,
  K extends keyof N["attributes"] & string,
> = `:${N["name"]}/${K}`;

