import { assertEntityTraitNames, assertUniqueIdents, reachableTraits, } from "./compose.js";
import { collectSchemaPolicy, } from "../internal/authorization/authoring/policy.js";
import { duplicateEntityName, schemaKeyMismatch, } from "./IdentName.js";
export const SCHEMA_POLICY = Symbol.for("ramose.schema.policy");
const collectPolicy = collectSchemaPolicy;
const isEntity = (value) => typeof value === "object" &&
    value !== null &&
    value._tag === "Entity" &&
    typeof value.ns === "string";
const assertCatalog = (entities) => {
    assertUniqueIdents(Object.values(entities));
    const traits = reachableTraits(Object.values(entities));
    assertEntityTraitNames(Object.keys(entities), traits);
};
const fromList = (list) => {
    const entities = {};
    for (const value of list) {
        if (!isEntity(value)) {
            throw new Error("ramose/schema: Schema([...]) expects Entity values");
        }
        if (Object.hasOwn(entities, value.ns))
            throw duplicateEntityName(value.ns);
        entities[value.ns] = value;
    }
    assertCatalog(entities);
    return entities;
};
const fromMap = (input) => {
    const seen = new Set();
    for (const [key, entity] of Object.entries(input)) {
        if (!isEntity(entity)) {
            throw new Error(`ramose/schema: Schema key ${JSON.stringify(key)} is not an Entity`);
        }
        if (key !== entity.ns)
            throw schemaKeyMismatch(key, entity.ns);
        if (seen.has(entity.ns))
            throw duplicateEntityName(entity.ns);
        seen.add(entity.ns);
    }
    assertCatalog(input);
    return input;
};
export function Schema(key, entities) {
    if (key.length === 0) {
        throw new Error("ramose/schema: permanent key must not be empty");
    }
    const entityMap = Array.isArray(entities)
        ? fromList(entities)
        : fromMap(entities);
    const policyState = { registered: false };
    let schema;
    const applyPolicy = ((...args) => {
        if (policyState.registered) {
            throw new Error(`ramose/schema: policy already applied to schema ${JSON.stringify(key)}`);
        }
        policyState.registered = true;
        policyState.policy = collectPolicy(schema, ...args);
    });
    schema = {
        _tag: "Schema",
        key,
        get schema() {
            return schema;
        },
        entities: entityMap,
        applyPolicy,
    };
    Object.defineProperty(schema, SCHEMA_POLICY, {
        value: policyState,
        enumerable: false,
        configurable: false,
        writable: false,
    });
    return Object.freeze(schema);
}
export const merge = (key, left, right) => {
    for (const ns of Object.keys(right.entities)) {
        if (Object.hasOwn(left.entities, ns))
            throw duplicateEntityName(ns);
    }
    return Schema(key, { ...left.entities, ...right.entities });
};
export const appliedPolicyOf = (schema) => schema[SCHEMA_POLICY]?.policy;
export const isSchemaDefinition = (value) => typeof value === "object" &&
    value !== null &&
    value._tag === "Schema" &&
    typeof value.key === "string" &&
    value.key.length > 0 &&
    value.schema === value &&
    typeof value.entities === "object" &&
    value.entities !== null &&
    typeof value.applyPolicy === "function";
export const schemaTraits = (schema) => reachableTraits(Object.values(schema.entities));
//# sourceMappingURL=Schema.js.map