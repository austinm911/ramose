import { fieldIdentOf } from "./compose.js";
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
const attributeMaps = (schema) => {
    const out = [];
    const seen = new Set();
    for (const entity of Object.values(schema.entities)) {
        for (const [key, field] of Object.entries(entity.fields)) {
            const ident = fieldIdentOf(field, `:${entity.ns}/${key}`);
            if (seen.has(ident))
                continue;
            seen.add(ident);
            out.push(attributeTx(ident, field));
        }
    }
    return out;
};
export const schemaTx = (schema) => attributeMaps(schema);
//# sourceMappingURL=ensure.js.map