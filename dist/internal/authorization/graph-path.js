import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { Unauthorized } from "../../db/Errors.js";
import { MAX_COLLECTION_SIZE, MAX_STRING_LENGTH } from "./bounds.js";
import {} from "./database-bindings.js";
import { CatalogId, } from "./identities.js";
import { constructAuthorizedResolvedRequestContext, executeWithinAuthorizedLease, } from "./request.js";
import { Index, ValueTag } from "../core/datom.js";
import { RAMOSE_TYPE_IDENT } from "../core/schema.js";
const GRAPH_TRAIT_IDENT = ":graph";
const GRAPH_NAME_IDENT = ":graph/name";
const GRAPH_CATALOG_IDENT = ":graph/catalog";
export class InvalidGraphPath extends Data.TaggedError("InvalidGraphPath") {
}
export class GraphPathSegmentInaccessible extends Data.TaggedError("GraphPathSegmentInaccessible") {
}
export class GraphPathSegmentWrongKind extends Data.TaggedError("GraphPathSegmentWrongKind") {
}
export class GraphPathCatalogUnavailable extends Data.TaggedError("GraphPathCatalogUnavailable") {
}
export class GraphPathAuthorizationFailed extends Data.TaggedError("GraphPathAuthorizationFailed") {
}
export class GraphPathDatabaseUnavailable extends Data.TaggedError("GraphPathDatabaseUnavailable") {
}
export class GraphPathProvisioningFailed extends Data.TaggedError("GraphPathProvisioningFailed") {
}
export const opaqueGraphPathDenial = (_error) => new Unauthorized({ status: 403 });
export const graphPathLeaseIdentity = (target, path) => Object.freeze({
    rootDatabase: target.derivation.rootDatabase,
    path: Object.freeze([...path]),
    routes: Object.freeze(target.routes.map((route) => Object.freeze({
        database: route.database,
        catalogKey: route.deployed.catalogKey,
        unitHash: route.deployed.unitHash,
    }))),
    dependencies: Object.freeze(target.dependencies.map((dependency) => Object.freeze({ ...dependency }))),
});
export const sameGraphPathLeaseIdentity = (left, right) => left.rootDatabase === right.rootDatabase &&
    left.path.length === right.path.length &&
    left.path.every((segment, index) => segment === right.path[index]) &&
    left.routes.length === right.routes.length &&
    left.routes.every((route, index) => {
        const other = right.routes[index];
        return other !== undefined &&
            route.database === other.database &&
            route.catalogKey === other.catalogKey &&
            route.unitHash === other.unitHash;
    }) &&
    left.dependencies.length === right.dependencies.length &&
    left.dependencies.every((dependency, index) => {
        const other = right.dependencies[index];
        return other !== undefined &&
            dependency.parentDatabase === other.parentDatabase &&
            dependency.graphEntity === other.graphEntity;
    });
export const graphPathLeaseDependsOn = (identity, dependency) => identity.dependencies.some((candidate) => candidate.parentDatabase === dependency.parentDatabase &&
    candidate.graphEntity === dependency.graphEntity);
export const catalogProvisioningAttributes = (definition) => Object.freeze(definition.unit.catalog.fields.map((field) => {
    const attribute = {
        ":db/ident": `:${field.id.owner.name}/${field.id.localName}`,
        ":db/valueType": `:db.type/${field.valueType}`,
        ":db/cardinality": `:db.cardinality/${field.cardinality}`,
        ...(field.unique === undefined
            ? {}
            : {
                ":db/unique": field.unique === "upsert"
                    ? ":db.unique/identity"
                    : ":db.unique/value",
            }),
        ...(field.index ? { ":db/index": true } : {}),
        ...(field.owned ? { ":db/isComponent": true } : {}),
        ...(field.optional && field.cardinality === "one"
            ? { ":db/optional": true }
            : {}),
        ...(field.doc === undefined ? {} : { ":db/doc": field.doc }),
    };
    return Object.freeze(attribute);
}));
const validatePath = (path) => {
    if (!Array.isArray(path) || path.length > MAX_COLLECTION_SIZE) {
        return Result.fail(new InvalidGraphPath({
            index: -1,
            reason: "graph path exceeds the collection bound",
        }));
    }
    for (let index = 0; index < path.length; index++) {
        const segment = path[index];
        if (typeof segment !== "string" ||
            segment.length === 0 ||
            segment.length > MAX_STRING_LENGTH) {
            return Result.fail(new InvalidGraphPath({
                index,
                reason: "graph path segments must be bounded non-empty strings",
            }));
        }
    }
    return Result.succeed(Object.freeze([...path]));
};
const authorizeRoute = (input, caller, route, index, view) => constructAuthorizedResolvedRequestContext({
    authenticate: Effect.succeed(caller),
    bindings: input.bindings,
    route,
    currentDb: input.currentDb,
    ...(view === undefined ? {} : { view }),
}, caller).pipe(Effect.mapError((error) => error instanceof Unauthorized
    ? new GraphPathAuthorizationFailed({ database: route.database, index })
    : new GraphPathDatabaseUnavailable({
        database: route.database,
        index,
        cause: error,
    })));
const lookupAuthorizedGraph = Effect.fn("Authorization.lookupAuthorizedGraphPathSegment")(function* (context, parent, segment, index) {
    const inaccessible = () => new GraphPathSegmentInaccessible({
        parentDatabase: parent.database,
        index,
        segment,
    });
    const graphEntity = yield* Effect.tryPromise({
        try: () => context.filteredDb.entid([GRAPH_NAME_IDENT, segment]),
        catch: (cause) => new GraphPathDatabaseUnavailable({
            database: parent.database,
            index,
            cause,
        }),
    });
    if (graphEntity === undefined)
        return yield* inaccessible();
    const row = yield* Effect.tryPromise({
        try: () => context.filteredDb.entity(graphEntity),
        catch: (cause) => new GraphPathDatabaseUnavailable({
            database: parent.database,
            index,
            cause,
        }),
    });
    if (row === undefined ||
        row[GRAPH_NAME_IDENT] !== segment ||
        typeof row[RAMOSE_TYPE_IDENT] !== "string") {
        return yield* inaccessible();
    }
    const concreteType = row[RAMOSE_TYPE_IDENT];
    if (context.filteredDb.composition === undefined ||
        !context.filteredDb.composition.isEntityIdent(concreteType) ||
        !context.filteredDb.composition.transitiveTraits(concreteType).includes(GRAPH_TRAIT_IDENT)) {
        return yield* new GraphPathSegmentWrongKind({
            parentDatabase: parent.database,
            index,
            segment,
            graphEntity,
        });
    }
    const catalogAttribute = context.currentDb.attr(GRAPH_CATALOG_IDENT);
    if (catalogAttribute === undefined) {
        return yield* new GraphPathCatalogUnavailable({
            parentDatabase: parent.database,
            index,
            graphEntity,
        });
    }
    const catalogDatoms = yield* Effect.tryPromise({
        try: () => context.currentDb.datomsArray(Index.EAVT, {
            e: graphEntity,
            a: catalogAttribute.id,
        }),
        catch: (cause) => new GraphPathDatabaseUnavailable({
            database: parent.database,
            index,
            cause,
        }),
    });
    if (catalogDatoms.length !== 1 ||
        catalogDatoms[0].vt !== ValueTag.Str ||
        typeof catalogDatoms[0].v !== "string" ||
        catalogDatoms[0].v.length === 0) {
        return yield* new GraphPathCatalogUnavailable({
            parentDatabase: parent.database,
            index,
            graphEntity,
        });
    }
    return Object.freeze({
        graphEntity,
        catalogKey: CatalogId.make(catalogDatoms[0].v),
    });
});
export const resolveAuthorizedGraphPath = Effect.fn("Authorization.resolveAuthorizedGraphPath")(function* (input, caller) {
    const path = yield* Effect.fromResult(validatePath(input.path));
    const graphs = [];
    const routes = [input.root];
    const dependencies = [];
    let route = input.root;
    let context;
    yield* input.provision(input.root, Object.freeze({
        rootDatabase: input.root.database,
        graphs: Object.freeze([]),
    })).pipe(Effect.mapError((cause) => new GraphPathProvisioningFailed({
        database: input.root.database,
        index: 0,
        cause,
    })));
    for (let index = 0; index <= path.length; index++) {
        context = yield* authorizeRoute(input, caller, route, index, index === path.length ? input.view : undefined);
        if (index === path.length)
            break;
        const graph = yield* lookupAuthorizedGraph(context, route, path[index], index);
        const child = yield* input.bindings.child(route, graph);
        dependencies.push(Object.freeze({
            parentDatabase: route.database,
            graphEntity: graph.graphEntity,
        }));
        const childDerivation = Object.freeze({
            rootDatabase: input.root.database,
            graphs: Object.freeze([...graphs, graph]),
        });
        yield* input.provision(child, childDerivation).pipe(Effect.mapError((cause) => new GraphPathProvisioningFailed({
            database: child.database,
            index,
            cause,
        })));
        graphs.push(graph);
        route = child;
        routes.push(child);
    }
    return Object.freeze({
        route,
        derivation: Object.freeze({
            rootDatabase: input.root.database,
            graphs: Object.freeze([...graphs]),
        }),
        context,
        routes: Object.freeze([...routes]),
        dependencies: Object.freeze([...dependencies]),
    });
});
export const executeAuthorizedGraphPathTarget = Effect.fn("Authorization.executeAuthorizedGraphPathTarget")(function* (input, execute) {
    return yield* executeWithinAuthorizedLease(input, (caller) => resolveAuthorizedGraphPath(input, caller).pipe(Effect.mapError(opaqueGraphPathDenial), Effect.flatMap(execute)));
});
export const executeAuthorizedGraphPath = Effect.fn("Authorization.executeAuthorizedGraphPath")(function* (input, execute) {
    return yield* executeAuthorizedGraphPathTarget(input, (target) => execute(target.context.filteredDb));
});
//# sourceMappingURL=graph-path.js.map