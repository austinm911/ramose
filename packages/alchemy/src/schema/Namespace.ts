/**
 * A named group of attributes. The namespace prefix is `ns`:
 * `Namespace("user", { name })` derives `:user/name`, and `User.name` is
 * the stamped attribute (an attr ref the query builder accepts).
 *
 * `_tag`, `ns`, and `attributes` are reserved and must not be attribute
 * keys — they stay on the namespace object.
 *
 * Each stamped attr carries literate pull methods: `User.age.optional`
 * and `User.friends.with({ ... })`.
 */

import type { AnyAttribute } from "./Attribute.ts";
import { nested, optional, type AttrPull } from "./Pull.ts";

export type AttributeMap = Record<string, AnyAttribute>;

export type StampedAttribute<
  Ns extends string,
  Name extends string,
  A extends AnyAttribute,
> = A & {
  readonly name: Name;
  readonly ident: `:${Ns}/${Name}`;
} & AttrPull<
    A & {
      readonly name: Name;
      readonly ident: `:${Ns}/${Name}`;
    }
  >;

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
 * const User = Namespace("user", { name: Attr(Schema.String) })
 * User.ns                 // "user"
 * User.name.ident         // ":user/name"
 * User.attributes.name    // same attr ref
 * User.age.optional       // maybe-missing pull field
 * User.friends.with({ name: User.name })
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
  const out: Record<string, StampedAttribute<string, string, AnyAttribute>> =
    {};
  for (const key of Object.keys(attributes)) {
    const a = attributes[key]!;
    const base = {
      ...a,
      name: key,
      ident: `:${name}/${key}` as const,
    };
    out[key] = {
      ...base,
      optional: optional(base),
      with: ((pattern: Record<string, unknown>) =>
        nested(base as never, pattern)) as StampedAttribute<
        string,
        string,
        AnyAttribute
      >["with"],
    };
  }
  return out as unknown as StampedAttributes<Name, Attrs>;
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
