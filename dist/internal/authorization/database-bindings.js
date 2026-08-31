import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { Unauthorized } from "../../db/Errors.js";
import { hashDomainSeparatedCanonicalJson } from "./decode.js";
import { CatalogMismatch, InvalidIR } from "./failures.js";
import { DatabaseId as DatabaseIdSchema } from "./identities.js";
const CHILD_DATABASE_ID_HASH_DOMAIN_V1 = "ramose/dynamic-child-database/v1\0";
const ResolvedDatabaseRouteTypeId = Symbol("ramose/internal/ResolvedDatabaseRoute");
const DatabaseCatalogBindingsTypeId = Symbol("ramose/internal/DatabaseCatalogBindings");
export class DynamicCatalogDefinitionMissing extends Data.TaggedError("DynamicCatalogDefinitionMissing") {
}
export class DatabaseCatalogBindingConflict extends Data.TaggedError("DatabaseCatalogBindingConflict") {
}
export class InvalidResolvedDatabaseRoute extends Data.TaggedError("InvalidResolvedDatabaseRoute") {
}
export class InvalidDynamicGraphIdentity extends Data.TaggedError("InvalidDynamicGraphIdentity") {
}
export const opaqueDatabaseBindingDenial = (_error) => new Unauthorized({});
const bindingStates = new WeakMap();
const routeStates = new WeakMap();
const compareBinding = (existing, source, definition) => existing.source._tag === "graph" &&
    existing.source.parentDatabase === source.parentDatabase &&
    existing.source.graphEntity === source.graphEntity &&
    existing.definition.catalogKey === definition.catalogKey &&
    existing.definition.unitHash === definition.unitHash;
const deployedCatalog = (database, definition) => Object.freeze({
    database,
    catalogKey: definition.catalogKey,
    unitHash: definition.unitHash,
    unit: definition.unit,
    composition: definition.composition,
});
const makeRoute = (owner, database, definition, source) => {
    const route = Object.freeze({
        [ResolvedDatabaseRouteTypeId]: ResolvedDatabaseRouteTypeId,
        database,
        deployed: deployedCatalog(database, definition),
    });
    const bound = Object.freeze({ route, definition, source });
    routeStates.set(route, { ...bound, owner });
    return bound;
};
const stateOf = (bindings) => {
    const state = bindingStates.get(bindings);
    return state === undefined
        ? Result.fail(new InvalidResolvedDatabaseRoute({
            message: "database catalog bindings were not created by deployDatabaseCatalogBindings",
        }))
        : Result.succeed(state);
};
const boundRoute = (bindings, route) => Result.gen(function* () {
    const state = yield* stateOf(bindings);
    const routed = routeStates.get(route);
    if (routed === undefined ||
        routed.owner !== state.owner ||
        state.byDatabase.get(route.database)?.route !== route ||
        route.deployed.database !== route.database ||
        route.deployed.catalogKey !== routed.definition.catalogKey ||
        route.deployed.unitHash !== routed.definition.unitHash) {
        return yield* Result.fail(new InvalidResolvedDatabaseRoute({
            message: "resolved database route is forged, stale, or belongs to another deployment",
        }));
    }
    return routed;
});
export const deriveDynamicChildDatabaseId = Effect.fn("Authorization.deriveDynamicChildDatabaseId")(function* (parentDatabase, graphEntity) {
    if (!Number.isSafeInteger(graphEntity) ||
        graphEntity < 0) {
        return yield* new InvalidDynamicGraphIdentity({ graphEntity });
    }
    const digest = yield* hashDomainSeparatedCanonicalJson(CHILD_DATABASE_ID_HASH_DOMAIN_V1, [parentDatabase, graphEntity]);
    return DatabaseIdSchema.make(digest);
});
export const deployDatabaseCatalogBindings = (definitions, roots) => Result.gen(function* () {
    const owner = Object.freeze({});
    const byDatabase = new Map();
    for (const database of roots.databases()) {
        const root = yield* roots.requireDatabase(database);
        const canonical = yield* definitions.require(root.definition.catalogKey);
        const read = yield* roots.catalogs.requireDatabase(database);
        if (canonical !== root.definition ||
            read.catalogKey !== canonical.catalogKey ||
            read.unitHash !== canonical.unitHash) {
            return yield* Result.fail(new InvalidIR({
                message: `configured database '${database}' does not match its immutable catalog definition`,
            }));
        }
        byDatabase.set(database, makeRoute(owner, database, canonical, Object.freeze({ _tag: "root" })));
    }
    let bindings;
    bindings = Object.freeze({
        [DatabaseCatalogBindingsTypeId]: DatabaseCatalogBindingsTypeId,
        root: (database) => {
            const found = byDatabase.get(database);
            return found?.source._tag === "root"
                ? Result.succeed(found.route)
                : Result.fail(new CatalogMismatch({
                    message: "catalog mismatch",
                    expectedDatabase: database,
                }));
        },
        child: Effect.fn("Authorization.resolveDynamicGraphChild")(function* (parent, graph) {
            const parentBound = yield* Effect.fromResult(boundRoute(bindings, parent));
            const database = yield* deriveDynamicChildDatabaseId(parentBound.route.database, graph.graphEntity);
            const definitionResult = definitions.require(graph.catalogKey);
            if (Result.isFailure(definitionResult)) {
                return yield* new DynamicCatalogDefinitionMissing({
                    parentDatabase: parentBound.route.database,
                    graphEntity: graph.graphEntity,
                    catalogKey: graph.catalogKey,
                });
            }
            const definition = definitionResult.success;
            const source = Object.freeze({
                _tag: "graph",
                parentDatabase: parentBound.route.database,
                graphEntity: graph.graphEntity,
            });
            const existing = byDatabase.get(database);
            if (existing !== undefined) {
                if (compareBinding(existing, source, definition))
                    return existing.route;
                return yield* new DatabaseCatalogBindingConflict({
                    database,
                    expectedCatalogKey: existing.definition.catalogKey,
                    expectedUnitHash: existing.definition.unitHash,
                    actualCatalogKey: definition.catalogKey,
                    actualUnitHash: definition.unitHash,
                });
            }
            const child = makeRoute(owner, database, definition, source);
            byDatabase.set(database, child);
            return child.route;
        }),
    });
    bindingStates.set(bindings, { owner, byDatabase });
    return bindings;
});
export const resolveBoundCatalogDefinition = (bindings, route) => Result.map(boundRoute(bindings, route), (bound) => Object.freeze({
    database: route.database,
    definition: bound.definition,
}));
export const acquireResolvedDatabase = (bindings, route, acquire) => Effect.gen(function* () {
    yield* Effect.fromResult(boundRoute(bindings, route));
    return yield* acquire(route.database);
});
export const deriveResolvedDatabaseRoute = Effect.fn("Authorization.deriveResolvedDatabaseRoute")(function* (bindings, derivation) {
    let route = yield* Effect.fromResult(bindings.root(derivation.rootDatabase));
    for (const graph of derivation.graphs) {
        route = yield* bindings.child(route, graph);
    }
    return route;
});
//# sourceMappingURL=database-bindings.js.map