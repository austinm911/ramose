/** Lower a schema to ident-datom maps. Ensure is a separate, idempotent schema tx. */
import { isOptionalField } from "./Field.js";
import { inferDbValueType, toWireValueType } from "./valueTypes.js";
const uniqueWire = {
    upsert: "identity",
    strict: "value",
};
export const attributeTx = (ident, field) => {
    const valueType = inferDbValueType(field.schema, field.valueType);
    const out = {
        ":db/ident": ident,
        ":db/valueType": toWireValueType(valueType),
        ":db/cardinality": `:db.cardinality/${field.cardinality}`,
    };
    if (field.unique !== undefined) {
        out[":db/unique"] =
            `:db.unique/${uniqueWire[field.unique]}`;
    }
    if (field.index) {
        out[":db/index"] = true;
    }
    if (field.owned) {
        out[":db/isComponent"] = true;
    }
    if (isOptionalField(field) && field.cardinality !== "many") {
        out[":db/optional"] = true;
    }
    if (field.doc !== undefined) {
        out[":db/doc"] = field.doc;
    }
    return out;
};
/** One map form per field, in schema / entity / key order. */
export const schemaTx = (schema) => {
    const out = [];
    for (const entity of Object.values(schema.entities)) {
        for (const [key, field] of Object.entries(entity.fields)) {
            out.push(attributeTx(`:${entity.ns}/${key}`, field));
        }
    }
    return out;
};
//# sourceMappingURL=ensure.js.map