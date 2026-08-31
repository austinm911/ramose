import * as Schema from "effect/Schema";
import { normalizeDoc } from "./documentation.js";
import { Bytes, Instant, Long, Ref as refSchema, Uuid, enumMembersOf, enumSchema, rememberValueType, tryInferDbValueType, untargetedRef, } from "./valueTypes.js";
const creationDefaultIdentities = new WeakMap();
const snapshotInputs = (value, seen = new WeakSet()) => {
    if (value === null ||
        typeof value === "string" ||
        typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new Error("ramose/default: inputs must contain only finite numbers");
        }
        return Object.is(value, -0) ? 0 : value;
    }
    if (value instanceof Date) {
        if (!Number.isFinite(value.getTime())) {
            throw new Error("ramose/default: inputs must contain only valid dates");
        }
        return new Date(value.getTime());
    }
    if (value instanceof Uint8Array)
        return new Uint8Array(value);
    if (seen.has(value)) {
        throw new Error("ramose/default: inputs must not contain cycles");
    }
    seen.add(value);
    if (Array.isArray(value)) {
        const snapshot = Object.freeze(value.map((item) => snapshotInputs(item, seen)));
        seen.delete(value);
        return snapshot;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new Error("ramose/default: inputs must be canonical JSON data");
    }
    const record = value;
    const out = Object.create(null);
    for (const key of Object.keys(record).sort()) {
        const item = record[key];
        if (item === undefined) {
            throw new Error("ramose/default: inputs must be canonical JSON data");
        }
        out[key] = snapshotInputs(item, seen);
    }
    seen.delete(value);
    return Object.freeze(out);
};
/**
 * Capture explicit default revision/configuration data immutably, then invoke
 * the deployed callback with ordinary JavaScript semantics. The callback is
 * trusted application code; `inputs` are inert compatibility metadata, not an
 * executable representation or sandbox boundary.
 */
export const creationDefault = (inputs, get) => {
    const snapshot = snapshotInputs(inputs);
    const declared = Object.freeze((context) => get(snapshotInputs(snapshot), context));
    creationDefaultIdentities.set(declared, Object.freeze({ inputs: snapshot }));
    return declared;
};
export const creationDefaultIdentityOf = (get) => creationDefaultIdentities.get(get);
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
        doc: normalizeDoc(options?.doc),
        valueType: tryInferDbValueType(schema),
        isOptional: options?.optional === true || schemaAllowsUndefined(schema),
        default: options?.default,
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
export const isOptionalField = (field) => field.cardinality === "many" || field.isOptional === true;
const fieldSchema = (input) => isField(input) ? input.schema : input;
const mergeFieldOptions = (input, extra) => {
    rejectRetiredOptions(extra);
    if (!isField(input))
        return extra ?? {};
    const doc = extra?.doc ?? input.doc;
    const defaultValue = extra?.default ?? input.default;
    return {
        index: extra?.index ?? input.index,
        ...(doc !== undefined && { doc }),
        optional: extra?.optional ?? input.isOptional,
        ...(defaultValue !== undefined && { default: defaultValue }),
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
const applyManyField = (input, options) => {
    if (isField(input) &&
        input.cardinality !== "many" &&
        input.default !== undefined &&
        options?.default === undefined) {
        throw new Error("ramose/schema: Field.many(defaultedField) requires a new array default");
    }
    return applyField(input, options, { cardinality: "many" });
};
export const Field = Object.assign(((input, options) => applyField(input, options)), {
    many: ((input, options) => applyManyField(input, options)),
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
/**
 * Floating-point number. Stored as `:db.type/double`.
 *
 * `Finite`, not `Number`: the wire format is JSON, where `Infinity` and `NaN`
 * serialize to `null`, so a non-finite value could never round-trip. Rejecting
 * it at the schema fails loudly instead of silently storing `null`.
 */
export const float = shorthand(Schema.Finite);
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