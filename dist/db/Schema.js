/** Composition of entities; the typed client's type parameter. */
import { conflictingIdent, duplicateEntityName, schemaKeyMismatch, } from "./IdentName.js";
const isEntity = (value) => typeof value === "object" &&
    value !== null &&
    value._tag === "Entity" &&
    typeof value.ns === "string";
const assertIdents = (entities) => {
    const seen = new Set();
    for (const entity of Object.values(entities)) {
        for (const key of Object.keys(entity.fields)) {
            const ident = `:${entity.ns}/${key}`;
            if (seen.has(ident))
                throw conflictingIdent(ident);
            seen.add(ident);
        }
    }
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
    assertIdents(entities);
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
    assertIdents(input);
    return input;
};
export function Schema(entities) {
    if (Array.isArray(entities)) {
        return { _tag: "Schema", entities: fromList(entities) };
    }
    return { _tag: "Schema", entities: fromMap(entities) };
}
/** Concatenate schemas. Overlapping entity names are rejected. */
export const merge = (left, right) => {
    for (const ns of Object.keys(right.entities)) {
        if (Object.hasOwn(left.entities, ns))
            throw duplicateEntityName(ns);
    }
    const entities = { ...left.entities, ...right.entities };
    assertIdents(entities);
    return { _tag: "Schema", entities };
};
//# sourceMappingURL=Schema.js.map