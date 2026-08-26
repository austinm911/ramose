/** Typed field: value Schema, cardinality, and options. */
import * as Schema from "effect/Schema";
import { Bytes, Instant, Long, Ref as refSchema, Uuid, enumMembersOf, enumSchema, rememberValueType, tryInferDbValueType, untargetedRef, } from "./valueTypes.js";
export const isField = (value) => typeof value === "object" &&
    value !== null &&
    value._tag === "Field" &&
    "schema" in value;
const rejectRetiredOptions = (options) => {
    if (options == null)
        return;
    if ("valueType" in options) {
        throw new Error("ramose/schema: valueType is not a field option. Brand the schema with stored(schema, vt).");
    }
    if ("cardinality" in options) {
        throw new Error("ramose/schema: cardinality is not a field option. Use Field.many(schema).");
    }
    if ("unique" in options) {
        throw new Error('ramose/schema: unique is not a field option. Use Field.unique(schema, "upsert" | "strict").');
    }
    if ("owned" in options || "isComponent" in options) {
        throw new Error("ramose/schema: owned is not a field option. Use Field.owned(schema).");
    }
};
const makeField = (schema, options, flags) => {
    rejectRetiredOptions(options);
    const unique = flags?.unique;
    const field = {
        _tag: "Field",
        schema,
        cardinality: flags?.cardinality ?? "one",
        unique,
        index: options?.index ?? unique !== undefined,
        owned: flags?.owned ?? false,
        doc: options?.doc,
        valueType: tryInferDbValueType(schema),
        isOptional: options?.optional === true || schemaAllowsUndefined(schema),
    };
    const members = enumMembersOf(schema);
    return members !== undefined ? Object.assign(field, { members }) : field;
};
const schemaAllowsUndefined = (schema) => {
    const ast = schema.ast;
    if (ast === undefined)
        return false;
    if (ast._tag === "Undefined")
        return true;
    if (ast._tag === "Union" && Array.isArray(ast.types)) {
        return ast.types.some((t) => t._tag === "Undefined" || schemaAllowsUndefined({ ast: t }));
    }
    return false;
};
/** Required-at-transact: card-many is never a required key. */
export const isOptionalField = (field) => field.cardinality === "many" || field.isOptional === true;
const fieldSchema = (input) => isField(input) ? input.schema : input;
const mergeFieldOptions = (input, extra) => {
    rejectRetiredOptions(extra);
    if (!isField(input))
        return extra ?? {};
    return {
        index: extra?.index ?? input.index,
        doc: extra?.doc ?? input.doc,
        optional: extra?.optional ?? input.isOptional,
    };
};
const mergeFlags = (input, flags) => {
    if (!isField(input))
        return flags ?? {};
    return {
        cardinality: flags?.cardinality ?? input.cardinality,
        unique: flags?.unique ?? input.unique,
        owned: flags?.owned ?? input.owned,
    };
};
const applyField = (input, options, flags) => makeField(fieldSchema(input), mergeFieldOptions(input, options), mergeFlags(input, flags));
/**
 * Declare a field. File it under an entity key to stamp `:entity/name`.
 *
 * Prefer the value shorthands (`string()`, `boolean()`, `Ref(User)`, …)
 * for app schemas. `Field(schema)` is the advanced form: a raw Effect
 * Schema. When inference cannot name `:db.type/*`, wrap the schema with
 * {@link import("./valueTypes.ts").stored} — `stored(Schema.Literals(["on", "off"]), "string")`.
 *
 * Cardinality, uniqueness and ownership are the function:
 * `Field.many(schema)`, `Field.unique(schema, "upsert" | "strict")`,
 * `Field.owned(schema)`. They compose with a shorthand or a raw Schema.
 * `"upsert"` unifies with the existing row on a colliding write;
 * `"strict"` rejects the write. Composition cannot change `valueType` —
 * brand the schema with {@link import("./valueTypes.ts").stored}.
 *
 * Runtime `isOptional` has a second source: an Effect schema AST that
 * admits `undefined`. `{ optional: true }` is the documented flag;
 * `Field(Schema.UndefinedOr(Schema.String))` is also optional. The
 * inference is not fail-closed here (#185).
 * `Field.unique` always indexes; `Field.unique(string({ index: false }), "upsert")`
 * discards `index: false` (unique implies index).
 */
export const Field = Object.assign(((input, options) => applyField(input, options)), {
    many: ((input, options) => applyField(input, options, { cardinality: "many" })),
    unique: ((input, uniqueness, options) => applyField(input, { ...mergeFieldOptions(input, options), index: true }, { unique: uniqueness })),
    owned: ((input, options) => applyField(input, options, { owned: true })),
});
const shorthand = (schema) => ((options) => makeField(schema, options));
/** Text. Stored as `:db.type/string`. */
export const string = shorthand(Schema.String);
/** True / false. Stored as `:db.type/boolean`. */
export const boolean = shorthand(Schema.Boolean);
/** Whole number. Stored as `:db.type/long` (plain `float()` / `Schema.Number` is double). */
export const int = shorthand(Long);
/** Floating-point number. Stored as `:db.type/double`. */
export const float = shorthand(Schema.Number);
/** Point in time. You pass and receive a `Date`. Stored as `:db.type/instant`. */
export const timestamp = shorthand(Instant);
/** Canonical UUID string. Stored as `:db.type/uuid`. */
export const uuid = shorthand(Uuid);
/** Binary data. Stored as `:db.type/bytes`. */
export const bytes = shorthand(Bytes);
/**
 * Closed string set. Stored as `:db.type/string`. `Enum(["low", "med"])`
 * types the field as `"low" | "med"` and carries the members on the
 * field (`Issue.status.members`) so the UI does not restate the list.
 */
export const Enum = ((values, options) => makeField(enumSchema(values), options));
/**
 * Targeted reference. Prefer `Ref(User)`; use `Ref(() => Other)` only
 * when the target is declared later. `Ref.self` is a self-ref.
 * The bare `Ref` (passed to {@link Field}) is an untargeted ref.
 */
export const Ref = Object.assign(((target, options) => makeField(refSchema(target), options)), untargetedRef, {
    self: makeField(refSchema.self),
});
rememberValueType(Ref, "ref");
//# sourceMappingURL=Field.js.map