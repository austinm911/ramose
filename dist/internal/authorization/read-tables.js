import { traitDefinitionOf } from "../../db/Binding.js";
import { documentationOf } from "../../db/documentation.js";
import { collectDefinitionEntities } from "../../db/reachability.js";
import { schemaTraits } from "../../db/Schema.js";
import { traitsOf, walkTraits } from "../../db/compose.js";
import { isSelfRefSchema, refTargetOf } from "../../db/valueTypes.js";
import { InvalidIR } from "./failures.js";
import { CatalogId, EntityId, FieldId, TraitId } from "./identities.js";
const invalid = (message) => new InvalidIR({ message });
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const ownerRef = (kind, name) => ({
    kind,
    name,
});
const stableDirectTraits = (owner) => {
    const seen = new Set();
    const out = [];
    for (const trait of traitsOf(owner)) {
        const stable = traitDefinitionOf(trait);
        if (seen.has(stable.ns))
            continue;
        seen.add(stable.ns);
        out.push(stable);
    }
    return out;
};
const directTraits = (catalog, owner) => stableDirectTraits(owner).map((trait) => TraitId.make({ catalog, name: trait.ns }));
const refTarget = (catalog, field) => {
    if (isSelfRefSchema(field.schema))
        return { _tag: "self" };
    const target = refTargetOf(field.schema)?.();
    if (target?._tag === "Entity" && target.ns !== undefined) {
        return { _tag: "entity", entity: EntityId.make({ catalog, name: target.ns }) };
    }
    if (target?._tag === "Trait" && target.ns !== undefined) {
        return { _tag: "trait", trait: TraitId.make({ catalog, name: target.ns }) };
    }
    return { _tag: "untargeted" };
};
const ownFields = (catalog, kind, owner) => {
    const fields = [];
    const expectedPrefix = `:${owner.ns}/`;
    for (const field of Object.values(owner.fields)) {
        if (!field.ident.startsWith(expectedPrefix))
            continue;
        const localName = field.ident.slice(expectedPrefix.length);
        if (localName.length === 0 || localName.includes("/")) {
            throw invalid(`invalid field identity '${field.ident}'`);
        }
        if (field.valueType === undefined) {
            throw invalid(`field '${field.ident}' has no storage value type`);
        }
        const common = {
            id: FieldId.make({ catalog, owner: ownerRef(kind, owner.ns), localName }),
            cardinality: field.cardinality,
            ...(field.unique === undefined ? {} : { unique: field.unique }),
            index: field.index,
            optional: field.isOptional,
            owned: field.owned,
            ...(field.doc === undefined ? {} : { doc: field.doc }),
        };
        fields.push(field.valueType === "ref"
            ? { ...common, valueType: "ref", refTarget: refTarget(catalog, field) }
            : { ...common, valueType: field.valueType });
    }
    return fields;
};
export const completeSchema = (definition) => {
    const entities = {};
    for (const reachable of collectDefinitionEntities(definition)) {
        entities[reachable.entity.ns] = reachable.entity;
    }
    return Object.freeze({
        _tag: "Schema",
        entities: Object.freeze(entities),
    });
};
export const descriptorTables = (catalog, schema, operations) => {
    const entities = Object.values(schema.entities).sort((left, right) => compareText(left.ns, right.ns));
    const traits = [...schemaTraits(schema).values()].sort((left, right) => compareText(left.ns, right.ns));
    const entityDescriptors = entities.map((entity) => {
        const doc = documentationOf(entity);
        return {
            id: EntityId.make({ catalog, name: entity.ns }),
            traits: directTraits(catalog, entity),
            ...(doc === undefined ? {} : { doc }),
        };
    });
    const traitDescriptors = traits.map((trait) => {
        const doc = documentationOf(trait);
        return {
            id: TraitId.make({ catalog, name: trait.ns }),
            traits: directTraits(catalog, trait),
            ...(doc === undefined ? {} : { doc }),
        };
    });
    const fields = [
        ...entities.flatMap((entity) => ownFields(catalog, "entity", entity)),
        ...traits.flatMap((trait) => ownFields(catalog, "trait", trait)),
    ];
    const traitComposition = entities.flatMap((entity) => stableDirectTraits(entity).map((stable) => {
        const nested = walkTraits(traitsOf(stable)).all;
        const names = [stable.ns, ...nested.map((trait) => trait.ns)];
        return {
            composer: EntityId.make({ catalog, name: entity.ns }),
            trait: TraitId.make({ catalog, name: stable.ns }),
            transitive: [...new Set(names)].map((name) => TraitId.make({ catalog, name })),
        };
    }));
    return {
        id: catalog,
        entities: entityDescriptors,
        traits: traitDescriptors,
        fields,
        operations,
        traitComposition,
    };
};
export const catalogReadTables = (definition) => descriptorTables(CatalogId.make(definition.key), completeSchema(definition), []);
//# sourceMappingURL=read-tables.js.map