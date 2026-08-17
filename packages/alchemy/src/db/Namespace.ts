/** Named group of attributes. `User.name` is the stamped attr ref (`:user/name`). */

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

/** Stamped attributes plus `ns` / `attributes`. `User.name` is the attr ref. */
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

/** Group attributes under one ident prefix. */
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
