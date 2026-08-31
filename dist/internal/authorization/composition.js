import * as Result from "effect/Result";
import { makeCompositionIndex, } from "../core/composition.js";
import { prepareAuthorizationCatalog } from "./validation/catalog.js";
const identOf = (name) => `:${name}`;
const traitSetRows = (rows) => {
    const out = [];
    for (const [name, traits] of rows) {
        out.push([identOf(name), [...traits].map(identOf)]);
    }
    return out;
};
export const compositionFromPrepared = (index) => makeCompositionIndex({
    entities: [...index.entities.keys()].map(identOf),
    traits: [...index.traits.keys()].map(identOf),
    entityTraits: traitSetRows(index.entityTraits),
    traitTraits: traitSetRows(index.traitTraits),
});
export const compositionFromDescriptor = (descriptor) => Result.gen(function* () {
    const prepared = yield* prepareAuthorizationCatalog({
        database: descriptor.database,
        catalog: descriptor.id,
        catalogVersion: descriptor.version,
        schemaFingerprint: descriptor.fingerprint,
    }, descriptor);
    return compositionFromPrepared(prepared);
});
export const compositionFromUnit = (unit) => compositionFromDescriptor(unit.catalog);
//# sourceMappingURL=composition.js.map