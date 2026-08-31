import { resolveCodeDefinition, traitDefinitionOf, } from "./Binding.js";
import { isOwnedOperation, OwnedOperations, } from "./Operation.js";
import { walkTraits } from "./compose.js";
import { compositionValueMetadata } from "./creation.js";
export class ReachabilityConflictError extends Error {
    name = "ReachabilityConflictError";
}
const formatPath = (path) => path.join(" → ");
const ownersOf = (entity) => {
    const traits = walkTraits(entity.traits).all
        .map((trait) => traitDefinitionOf(trait))
        .sort((left, right) => left.ns < right.ns ? -1 : left.ns > right.ns ? 1 : 0);
    return [entity, ...traits];
};
export const collectDefinitionEntities = (definition) => {
    const byName = new Map();
    const queue = [];
    const add = (entity, path) => {
        const previous = byName.get(entity.ns);
        if (previous !== undefined) {
            if (previous.entity !== entity) {
                throw new ReachabilityConflictError(`ramose/reachability: entity ${JSON.stringify(entity.ns)} names different definitions (paths: ${formatPath(previous.path)}; ${formatPath(path)})`);
            }
            return;
        }
        const reachable = Object.freeze({ entity, path: Object.freeze([...path]) });
        byName.set(entity.ns, reachable);
        queue.push(reachable);
    };
    for (const entityName of Object.keys(definition.schema.entities).sort()) {
        add(definition.schema.entities[entityName], [
            `catalog:${definition.key}`,
            "schema",
            `entity:${entityName}`,
        ]);
    }
    for (let index = 0; index < queue.length; index++) {
        const reachable = queue[index];
        for (const owner of ownersOf(reachable.entity)) {
            const operations = owner[OwnedOperations] ?? {};
            for (const localName of Object.keys(operations).sort()) {
                const operation = operations[localName];
                if (!isOwnedOperation(operation))
                    continue;
                const writes = [...operation.writes].sort((left, right) => left.ns < right.ns ? -1 : left.ns > right.ns ? 1 : 0);
                for (const write of writes) {
                    add(write, [
                        ...reachable.path,
                        `operation:${owner.ns}.${localName}`,
                        `writes:${write.ns}`,
                    ]);
                }
            }
        }
    }
    return Object.freeze([...queue]);
};
/**
 * Walk root catalog → schema → entities → operations/writes → traits →
 * bindings → dependencies.
 * Definitions are marked by permanent key before descending, so recursive
 * graphs terminate. The result is inert authoring metadata, not a registry.
 */
export const collectCodeReachability = (rootRef) => {
    const root = resolveCodeDefinition(rootRef);
    const byKey = new Map();
    const definitions = [];
    const bindings = [];
    const creation = [];
    const visit = (definition, path) => {
        const nextPath = [...path, `catalog:${definition.key}`];
        const previous = byKey.get(definition.key);
        if (previous !== undefined) {
            if (previous.definition !== definition) {
                throw new ReachabilityConflictError(`ramose/reachability: permanent key ${JSON.stringify(definition.key)} names different definitions (paths: ${formatPath(previous.path)}; ${formatPath(nextPath)})`);
            }
            return;
        }
        const reachable = Object.freeze({
            key: definition.key,
            definition,
            path: Object.freeze(nextPath),
        });
        byKey.set(definition.key, reachable);
        definitions.push(reachable);
        for (const reachableEntity of collectDefinitionEntities(definition)) {
            const entity = reachableEntity.entity;
            const metadata = compositionValueMetadata(entity);
            creation.push(Object.freeze({
                catalogKey: definition.key,
                entity: entity.ns,
                metadata,
            }));
            for (const use of metadata.bindings) {
                const bindingPath = Object.freeze([
                    ...nextPath,
                    ...reachableEntity.path.slice(1),
                    ...use.path.slice(1),
                ]);
                bindings.push(Object.freeze({
                    catalogKey: definition.key,
                    entity: entity.ns,
                    binding: use.binding,
                    path: bindingPath,
                }));
                const dependencies = [...use.binding.dependencies].sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
                for (const dependency of dependencies) {
                    visit(dependency, [...bindingPath, "dependencies"]);
                }
            }
        }
    };
    visit(root, []);
    const frozenDefinitions = Object.freeze([...definitions]);
    const frozenBindings = Object.freeze([...bindings]);
    const frozenCreation = Object.freeze([...creation]);
    return Object.freeze({
        root,
        definitions: frozenDefinitions,
        bindings: frozenBindings,
        creation: frozenCreation,
    });
};
//# sourceMappingURL=reachability.js.map