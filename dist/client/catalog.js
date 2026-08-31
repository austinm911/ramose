import * as Effect from "effect/Effect";
import { compositionFromSchema } from "../db/composition.js";
import { schemaTx } from "../db/ensure.js";
import { hashReadCompatibility } from "../internal/authorization/read-compatibility.js";
import { catalogReadTables, completeSchema, } from "../internal/authorization/read-tables.js";
import { makeClientProjectionCatalog, } from "../internal/replication/projection-binding.js";
const CARDINALITY = {
    ":db.cardinality/one": "one",
    ":db.cardinality/many": "many",
};
const UNIQUE = {
    ":db.unique/identity": "identity",
    ":db.unique/value": "value",
};
const attributeSpecs = (schema) => Object.freeze(schemaTx(schema).map((attribute) => {
    const cardinality = CARDINALITY[attribute[":db/cardinality"]];
    if (cardinality === undefined) {
        throw new Error(`ramose/client: unknown cardinality for ${attribute[":db/ident"]}`);
    }
    const unique = attribute[":db/unique"] === undefined
        ? undefined
        : UNIQUE[attribute[":db/unique"]];
    if (attribute[":db/unique"] !== undefined && unique === undefined) {
        throw new Error(`ramose/client: unknown uniqueness for ${attribute[":db/ident"]}`);
    }
    return {
        ident: attribute[":db/ident"],
        valueType: attribute[":db/valueType"],
        cardinality,
        ...(unique === undefined ? {} : { unique }),
        index: attribute[":db/index"] === true,
        isComponent: attribute[":db/isComponent"] === true,
        optional: attribute[":db/optional"] === true,
    };
}));
export const installClientCatalog = async (definition, projections = []) => {
    const schema = completeSchema(definition);
    const readCompatibilityHash = await Effect.runPromise(hashReadCompatibility(catalogReadTables(definition)));
    return Object.freeze({
        key: definition.key,
        schema,
        attributes: attributeSpecs(schema),
        composition: compositionFromSchema(schema),
        readCompatibilityHash,
        projections: makeClientProjectionCatalog(`${definition.key}:${readCompatibilityHash}`, projections),
    });
};
//# sourceMappingURL=catalog.js.map