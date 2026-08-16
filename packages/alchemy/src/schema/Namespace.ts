/**
 * A named group of attributes. The namespace prefix is `ns`:
 * `Namespace("user", { name })` derives `:user/name`, and `User.name` is
 * the stamped attribute (an attr ref the query builder accepts).
 *
 * `_tag`, `ns`, and `attributes` are reserved and must not be attribute
 * keys — they stay on the namespace object.
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

/**
 * A namespace is its stamped attributes, plus `ns` / `attributes` for
 * the prefix and the same map under an explicit key.
 *
 * ```ts
 * const User = Namespace("user", { name: attr(Schema.String) })
 * User.ns                 // "user"
 * User.name.ident         // ":user/name"
 * User.attributes.name    // same attr ref
 * ```
 */
export type Namespace<
  Name extends string = string,
  Attrs extends AttributeMap = AttributeMap,
> = {
  readonly _tag: "Namespace";
  readonly ns: Name;
  readonly attributes: StampedAttributes<Name, Attrs>;
} & StampedAttributes<Name, Attrs>;

export type AnyNamespace = {
  readonly _tag: "Namespace";
  readonly ns: string;
  readonly attributes: StampedAttributes<string, AttributeMap>;
};

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
 * Group attributes under one ident prefix. Attribute keys are also on
 * the namespace object so `User.name` is an attr ref.
 */
export const Namespace = <
  const Name extends string,
  Attrs extends AttributeMap,
>(
  name: Name,
  attributes: Attrs,
): Namespace<Name, Attrs> => {
  const stamped = stamp(name, attributes);
  return {
    _tag: "Namespace" as const,
    ns: name,
    attributes: stamped,
    ...stamped,
  };
};

export type AttrOf<
  N extends AnyNamespace,
  K extends keyof N["attributes"],
> = N["attributes"][K];

export type IdentOf<
  N extends AnyNamespace,
  K extends keyof N["attributes"] & string,
> = `:${N["ns"]}/${K}`;
