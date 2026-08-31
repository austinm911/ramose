import * as Schema from "effect/Schema";
import { isComposer } from "./Composer.js";
export const toWireValueType = (vt) => `:db.type/${vt}`;
const known = new WeakMap();
const asVt = (schema, vt) => {
    known.set(schema, vt);
    return schema;
};
/**
 * Brand a raw Effect Schema with its storage form so {@link Field} can
 * infer `:db.type/*`. The advanced-form hatch — `valueType` is not a
 * field option.
 *
 * ```ts
 * Field(stored(Schema.Literals(["on", "off"]), "string"))
 * Field(stored(Schema.String, "uuid"))
 * ```
 *
 * The pair is checked: `"instant"` needs a `Date`-typed schema,
 * `"string"` / `"uuid"` a string-typed one, and so on. A mismatch
 * (`stored(Schema.Boolean, "string")`) is a type error. An already
 * branded helper (`Uuid`, `Long`, a previous `stored`) may only
 * re-brand with the same vt — pass the unbranded Schema to change it.
 */
export const stored = (schema, vt) => asVt(schema.annotate({ identifier: `ramose/stored/${vt}` }), vt);
/**
 * UUID as a canonical string. Lowers to `:db.type/uuid`. The `{ vt: 6, v }`
 * tagged form is wire-internal — the public type is `string`.
 */
export const Uuid = asVt(Schema.String.annotate({ identifier: "ramose/uuid" }), "uuid");
const resolveRefTarget = (target) => isComposer(target)
    ? () => target
    : target;
export const untargetedRef = asVt(Schema.Finite.annotate({ identifier: "ramose/ref" }), "ref");
export const Ref = Object.assign((target) => Object.assign(asVt(Schema.Finite.annotate({ identifier: "ramose/ref" }), "ref"), {
    _resolve: resolveRefTarget(target),
}), {
    self: Object.assign(asVt(Schema.Finite.annotate({ identifier: "ramose/ref-self" }), "ref"), { _self: true }),
});
known.set(Ref, "ref");
known.set(Ref.self, "ref");
export const rememberValueType = (schema, vt) => {
    known.set(schema, vt);
};
export const isSelfRefSchema = (schema) => (typeof schema === "object" || typeof schema === "function") &&
    schema !== null &&
    schema._self === true;
export const refTargetOf = (schema) => {
    if ((typeof schema !== "object" && typeof schema !== "function") || schema === null) {
        return undefined;
    }
    const resolve = schema._resolve;
    if (resolve === undefined)
        return undefined;
    return () => {
        const target = resolve();
        return {
            ...(target._tag !== undefined
                ? { _tag: target._tag }
                : {}),
            fields: target.fields ?? {},
            ...(target.ns !== undefined && { ns: target.ns }),
        };
    };
};
/** Integer long. Lowers to `:db.type/long` (plain `Schema.Number` is double). */
export const Long = asVt(Schema.Finite.annotate({ identifier: "ramose/long" }), "long");
/** Instant. Lowers to `:db.type/instant`. */
export const Instant = asVt(Schema.Date.annotate({ identifier: "ramose/instant" }), "instant");
/** Byte array. Lowers to `:db.type/bytes`. */
export const Bytes = asVt(Schema.Uint8Array.annotate({ identifier: "ramose/bytes" }), "bytes");
const enumMembers = new WeakMap();
export const enumSchema = (values) => {
    if (values.length === 0) {
        throw new Error("ramose/schema: Enum([...]) needs at least one value");
    }
    const schema = asVt(Schema.Literals(values), "string");
    enumMembers.set(schema, values);
    return schema;
};
export const enumMembersOf = (schema) => enumMembers.get(schema);
export const tryInferDbValueType = (schema, override) => {
    if (override !== undefined)
        return override;
    const mapped = known.get(schema);
    if (mapped !== undefined)
        return mapped;
    switch (schema.ast._tag) {
        case "String":
            return "string";
        case "Number":
            return "double";
        case "Boolean":
            return "boolean";
        default:
            return undefined;
    }
};
export const inferDbValueType = (schema, override) => {
    const vt = tryInferDbValueType(schema, override);
    if (vt !== undefined)
        return vt;
    throw new Error(`ramose/schema: cannot infer value type from this Schema (ast._tag=${schema.ast._tag}). Wrap it with stored(schema, vt).`);
};
//# sourceMappingURL=valueTypes.js.map