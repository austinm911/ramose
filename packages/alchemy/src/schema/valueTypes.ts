/**
 * The eight `:db.type/*` idents the engine already persists
 * (`packages/core/src/schema.ts` VALUE_TYPE_IDENTS), plus Effect Schema
 * values that lower onto them.
 *
 * Prefer `effect/Schema` primitives (`Schema.String`, `Schema.Boolean`, …)
 * and the helpers here when the Ripple tag is not the Schema default
 * (`Number` → double, not long or ref).
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

/**
 * Uuid as the engine currently *reads* it: `{ vt: 6, v: "…" }`, not a
 * string. See the uuid wart in `docs/EFFECT_SCHEMA.md`.
 */
export const Uuid = Schema.Struct({
  vt: Schema.Literal(6),
  v: Schema.String,
});
export type Uuid = Schema.Schema.Type<typeof Uuid>;

/** Write-side uuid: a canonical string. Lowers to `:db.type/uuid`. */
export const UuidString = Schema.String.annotate({ identifier: "ripple/uuid-string" });
export type UuidString = Schema.Schema.Type<typeof UuidString>;

/** Entity reference (eid). Lowers to `:db.type/ref`. */
export const Ref = Schema.Number.annotate({ identifier: "ripple/ref" });
export type Ref = Schema.Schema.Type<typeof Ref>;

/** Integer long. Lowers to `:db.type/long` (plain `Schema.Number` is double). */
export const Long = Schema.Number.annotate({ identifier: "ripple/long" });
export type Long = Schema.Schema.Type<typeof Long>;

/** Instant. Lowers to `:db.type/instant`. */
export const Instant = Schema.Date.annotate({ identifier: "ripple/instant" });
export type Instant = Schema.Schema.Type<typeof Instant>;

/** Byte array. Lowers to `:db.type/bytes`. */
export const Bytes = Schema.Uint8Array.annotate({ identifier: "ripple/bytes" });
export type Bytes = Schema.Schema.Type<typeof Bytes>;

const known = new WeakMap<object, DbValueType>();
known.set(Uuid, ":db.type/uuid");
known.set(UuidString, ":db.type/uuid");
known.set(Ref, ":db.type/ref");
known.set(Long, ":db.type/long");
known.set(Instant, ":db.type/instant");
known.set(Bytes, ":db.type/bytes");

/**
 * Pick the `:db.type/*` ident for a value Schema. Explicit
 * `options.valueType` on the attribute wins; then the helpers above; then
 * the AST tag of the common primitives. Anything else must set `valueType`.
 */
export const inferDbValueType = (
  schema: Schema.Top,
  override?: DbValueType,
): DbValueType => {
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
      throw new Error(
        `ripple/schema: cannot infer :db.type/* from this Schema (ast._tag=${schema.ast._tag}). Pass valueType on the attribute.`,
      );
  }
};
