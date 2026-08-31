import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { assembleCatalogDefinitions, deployCatalogDefinitions, } from "../internal/authorization/definitions.js";
import { deployDatabaseCatalogBindings, } from "../internal/authorization/database-bindings.js";
import { CatalogId, DatabaseId, } from "../internal/authorization/identities.js";
import { sha256Hex } from "../internal/core/bytes.js";
const OperationCatalogsTypeId = Symbol.for("ramose/worker/OperationCatalogs");
export class OperationCatalogDeploymentError extends Data.TaggedError("OperationCatalogDeploymentError") {
}
const registries = new WeakMap();
const deploymentError = (cause) => new OperationCatalogDeploymentError({
    message: cause instanceof Error ? cause.message : String(cause),
});
const DEPLOYMENT_ID_DOMAIN = "ramose:worker-deployment:v1\0";
const textEncoder = new TextEncoder();
const artifactHashForDeployment = (metadata) => {
    const id = typeof metadata === "object" && metadata !== null
        ? metadata.id
        : undefined;
    if (typeof id !== "string" || !/^[\x21-\x7e]{1,256}$/.test(id)) {
        return Effect.fail(new OperationCatalogDeploymentError({
            message: "CF_VERSION_METADATA.id must be a non-empty deployment version string",
        }));
    }
    return Effect.tryPromise({
        try: () => sha256Hex(textEncoder.encode(`${DEPLOYMENT_ID_DOMAIN}${id}`)),
        catch: deploymentError,
    }).pipe(Effect.map((digest) => digest));
};
const wrapOperationCatalogs = (deployed, bindings) => {
    const operationCatalogs = Object.freeze({
        [OperationCatalogsTypeId]: OperationCatalogsTypeId,
        proof: (database) => {
            const bound = Result.getOrUndefined(deployed.requireDatabase(DatabaseId.make(database)));
            return bound === undefined
                ? undefined
                : Object.freeze({
                    catalog: bound.definition.catalogKey,
                    unitHash: bound.definition.unitHash,
                });
        },
    });
    registries.set(operationCatalogs, { deployed, bindings });
    return operationCatalogs;
};
export const deployedCatalogProof = (operationCatalogs, database) => {
    const state = registries.get(operationCatalogs);
    if (state === undefined)
        return undefined;
    const bound = Result.getOrUndefined(state.deployed.requireDatabase(DatabaseId.make(database)));
    return bound === undefined ? undefined : Object.freeze({
        catalogKey: bound.definition.catalogKey,
        unitHash: bound.definition.unitHash,
    });
};
export const deployedOperationCatalogs = (operationCatalogs) => {
    const state = registries.get(operationCatalogs);
    if (state === undefined) {
        throw new Error("operation catalogs were not created by deployOperationCatalogs");
    }
    return state.deployed;
};
export const deployedDatabaseCatalogBindings = (operationCatalogs) => {
    const state = registries.get(operationCatalogs);
    if (state === undefined) {
        throw new Error("operation catalogs were not created by deployOperationCatalogs");
    }
    return state.bindings;
};
export const deployOperationCatalogsForVersion = Effect.fn("Worker.deployOperationCatalogs")(function* (input, versionMetadata) {
    const artifactHash = yield* artifactHashForDeployment(versionMetadata);
    const definitions = yield* assembleCatalogDefinitions({
        root: input.root,
        artifactHash,
    });
    const deployed = yield* Effect.fromResult(deployCatalogDefinitions(definitions, input.deployments.map((deployment) => ({
        database: DatabaseId.make(deployment.database),
        catalogKey: CatalogId.make(deployment.catalogKey ?? input.root.key),
    }))));
    const bindings = yield* Effect.fromResult(deployDatabaseCatalogBindings(definitions, deployed));
    return wrapOperationCatalogs(deployed, bindings);
}, Effect.mapError(deploymentError));
//# sourceMappingURL=operation-catalogs.js.map