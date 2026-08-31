import { composerIdent, reachableTraits, transitiveTraitIdents, } from "./compose.js";
import { makeCompositionIndex } from "../internal/core/composition.js";
export const compositionFromSchema = (schema) => {
    const entities = Object.values(schema.entities);
    const traits = reachableTraits(entities);
    const entityTraits = [];
    for (const entity of entities) {
        entityTraits.push([
            composerIdent(entity.ns),
            transitiveTraitIdents(entity),
        ]);
    }
    const traitTraits = [];
    for (const [ns, trait] of traits) {
        traitTraits.push([composerIdent(ns), transitiveTraitIdents(trait)]);
    }
    return makeCompositionIndex({
        entities: entities.map((entity) => composerIdent(entity.ns)),
        traits: [...traits.keys()].map((ns) => composerIdent(ns)),
        entityTraits,
        traitTraits,
    });
};
//# sourceMappingURL=composition.js.map