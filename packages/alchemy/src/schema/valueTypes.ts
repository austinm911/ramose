/**
 * The eight `:db.type/*` idents the engine already persists
 * (`packages/core/src/schema.ts` VALUE_TYPE_IDENTS), plus Effect Schema
 * values that lower onto them.
 *
 * Prefer `effect/Schema` primitives (`Schema.String`, `Schema.Boolean`, …)
 * and the helpers here when the Ripple tag is not the Schema default
 * (`Number` → double, not long or ref).
 *
 * `Attr` infers `:db.type/*` from the Schema at the type level: helpers
 * carry a brand (`Long` → `":db.type/long"`), primitives follow
 * `Schema.Type` (`string` / `number` / `boolean`). Explicit `valueType`
 * on `Attr` remains an override for custom Schemas.
 */

import * as Schema from "effect/Schema";

export type DbValueType =
  | ":db.type/string"
  | ":db.type/long"
  | ":db.type/double"
  | ":db.type/boolean"
  | ":db.type/ref"
  | ":db.type/uuid"
  | ":db.type/instant"
  | ":db.type/bytes";

declare const RippleVt: unique symbol;

/** Type-level brand so `Attr(Long)` stamps `valueType` without an option. */
export type RippleVt<VT extends DbValueType> = {
  readonly [RippleVt]: VT;
};

/**
 * `:db.type/*` inferred from a value Schema. Helper brands win; then
 * decoded `string` / `number` / `boolean` → string / double / boolean.
 * Anything else is `undefined` (pass `valueType` on `Attr`).
 */
export type InferDbValueType<S> = S extends RippleVt<infer V>
  ? V
  : S extends { readonly Type: infer T }
    ? [T] extends [string]
      ? ":db.type/string"
      : [T] extends [number]
        ? ":db.type/double"
        : [T] extends [boolean]
          ? ":db.type/boolean"
          : undefined
    : undefined;

const known = new WeakMap<object, DbValueType>();

const asVt = <S extends Schema.Top, const VT extends DbValueType>(
  schema: S,
  vt: VT,
): S & RippleVt<VT> => {
  known.set(schema, vt);
  return schema as S & RippleVt<VT>;
};

/**
 * Uuid as the engine currently *reads* it: `{ vt: 6, v: "…" }`, not a
 * string. See the uuid wart in `docs/EFFECT_SCHEMA.md`.
 */
export const Uuid = asVt(
  Schema.Struct({
    vt: Schema.Literal(6),
    v: Schema.String,
  }),
  ":db.type/uuid",
);
export type Uuid = Schema.Schema.Type<typeof Uuid>;

/** Write-side uuid: a canonical string. Lowers to `:db.type/uuid`. */
export const UuidString = asVt(
  Schema.String.annotate({ identifier: "ripple/uuid-string" }),
  ":db.type/uuid",
);
export type UuidString = Schema.Schema.Type<typeof UuidString>;

/** Entity reference (eid). Lowers to `:db.type/ref`. */
export const Ref = asVt(
  Schema.Number.annotate({ identifier: "ripple/ref" }),
  ":db.type/ref",
);
export type Ref = Schema.Schema.Type<typeof Ref>;

/** Integer long. Lowers to `:db.type/long` (plain `Schema.Number` is double). */
export const Long = asVt(
  Schema.Number.annotate({ identifier: "ripple/long" }),
  ":db.type/long",
);
export type Long = Schema.Schema.Type<typeof Long>;

/** Instant. Lowers to `:db.type/instant`. */
export const Instant = asVt(
  Schema.Date.annotate({ identifier: "ripple/instant" }),
  ":db.type/instant",
);
export type Instant = Schema.Schema.Type<typeof Instant>;

/** Byte array. Lowers to `:db.type/bytes`. */
export const Bytes = asVt(
  Schema.Uint8Array.annotate({ identifier: "ripple/bytes" }),
  ":db.type/bytes",
);
export type Bytes = Schema.Schema.Type<typeof Bytes>;

export const tryInferDbValueType = (
  schema: Schema.Top,
  override?: DbValueType,
): DbValueType | undefined => {
  if (override !== undefined) return override;
  const mapped = known.get(schema);
  if (mapped !== undefined) return mapped;
  switch (schema.ast._tag) {
    case "String":
      return ":db.type/string";
    case "Number":
      return ":db.type/double";
    case "Boolean":
      return ":db.type/boolean";
    default:
      return undefined;
  }
};

/**
 * Pick the `:db.type/*` ident for a value Schema. Explicit
 * `options.valueType` on the attribute wins; then the helpers above; then
 * the AST tag of the common primitives. Anything else must set `valueType`.
 */
export const inferDbValueType = (
  schema: Schema.Top,
  override?: DbValueType,
): DbValueType => {
  const vt = tryInferDbValueType(schema, override);
  if (vt !== undefined) return vt;
  throw new Error(
    `ripple/schema: cannot infer :db.type/* from this Schema (ast._tag=${schema.ast._tag}). Pass valueType on the attribute.`,
  );
};
