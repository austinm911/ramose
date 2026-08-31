import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { appliedPolicyOf, isSchemaDefinition, } from "../../db/Schema.js";
import { cloneBindingValue } from "../../db/Binding.js";
import { compileCreationPlan, pairDeployedCreationDefaults, resolveCompiledCreationValues, } from "../../db/creation.js";
import {} from "../../db/Field.js";
import { collectCodeReachability, } from "../../db/reachability.js";
import { sealInstalledCatalogUnit, } from "./catalog-unit.js";
import { compositionFromUnit } from "./composition.js";
import { decodePolicyTemplateResult, hashCatalogSchemaFingerprint, hashDomainSeparatedCanonicalJson, } from "./decode.js";
import { CatalogMismatch, CatalogUnitCorrupt, CatalogVersionMismatch, InvalidIR, } from "./failures.js";
import { CatalogId, CatalogVersion, DatabaseId, SchemaFingerprint, } from "./identities.js";
import { installAuthorization } from "./install.js";
import { completeSchema, descriptorTables } from "./read-tables.js";
import { lowerOwnedOperationSnapshots, pairDeployedOperations, snapshotOwnedOperations, } from "./authoring/operations.js";
import { compileReadAuthorization } from "./authoring/compile.js";
import { requireCatalogKey, requireUnitHash, } from "./deployed.js";
const invalid = (message) => new InvalidIR({ message });
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const CATALOG_DEFINITION_VERSION_DOMAIN = "ramose/catalog-definition/v1\0";
const fromPure = (label, evaluate) => Effect.try({
    try: evaluate,
    catch: (cause) => invalid(`${label}: ${cause instanceof Error ? cause.message : String(cause)}`),
});
const jsonValue = (value) => {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return Object.is(value, -0) ? 0 : value;
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return { _tag: "instant", value: value.toISOString() };
    }
    if (value instanceof Uint8Array) {
        return { _tag: "bytes", value: [...value] };
    }
    if (Array.isArray(value))
        return value.map(jsonValue);
    if (typeof value === "object" && value !== null) {
        const out = Object.create(null);
        for (const key of Object.keys(value).sort(compareText)) {
            out[key] = jsonValue(value[key]);
        }
        return out;
    }
    throw new Error("catalog fixed values must encode as finite stored data");
};
const creationInputHashValue = (value) => {
    if (value === null)
        return { _tag: "null" };
    if (typeof value === "string")
        return { _tag: "string", value };
    if (typeof value === "boolean")
        return { _tag: "boolean", value };
    if (typeof value === "number" && Number.isFinite(value)) {
        return { _tag: "number", value: Object.is(value, -0) ? 0 : value };
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return { _tag: "instant", value: value.toISOString() };
    }
    if (value instanceof Uint8Array) {
        return { _tag: "bytes", value: [...value] };
    }
    if (Array.isArray(value)) {
        return { _tag: "array", value: value.map(creationInputHashValue) };
    }
    if (typeof value === "object" && value !== null) {
        return {
            _tag: "object",
            value: Object.keys(value).sort(compareText).map((key) => [
                key,
                creationInputHashValue(value[key]),
            ]),
        };
    }
    throw new Error("creation default inputs must encode as supported canonical data");
};
const creationHashMaterial = (artifactHash, plans) => ({
    artifactHash,
    entities: [...plans].sort((left, right) => compareText(left.entity, right.entity))
        .map((plan) => ({
        name: plan.entity,
        fieldSchemas: [...plan.fields]
            .sort((left, right) => compareText(left.ident, right.ident))
            .map((field) => ({
            field: field.ident,
            projection: field.schemaProjection,
        })),
        fieldDefaults: plan.fields
            .filter((field) => field.fieldDefault !== undefined)
            .sort((left, right) => compareText(left.ident, right.ident))
            .map((field) => ({
            field: field.ident,
            default: {
                id: field.fieldDefault.id,
                artifactHash: field.fieldDefault.artifactHash,
                revision: field.fieldDefault.revision._tag === "artifact"
                    ? "artifact"
                    : creationInputHashValue(field.fieldDefault.revision.inputs),
            },
        })),
        fixed: plan.fields
            .filter((field) => field.fixed !== undefined)
            .sort((left, right) => compareText(left.ident, right.ident))
            .map((field) => ({ field: field.ident, value: jsonValue(field.fixed) })),
        defaults: plan.fields
            .filter((field) => field.defaults.length > 0)
            .sort((left, right) => compareText(left.ident, right.ident))
            .map((field) => ({
            field: field.ident,
            defaults: field.defaults.map((entry) => ({
                id: entry.id,
                artifactHash: entry.artifactHash,
                revision: entry.revision._tag === "artifact"
                    ? "artifact"
                    : creationInputHashValue(entry.revision.inputs),
            })),
        })),
        bindings: plan.bindings,
    })),
});
const normalizeDefinitionSnapshot = (reachable, artifactHash, metadataByEntity) => {
    if (!isSchemaDefinition(reachable.definition)) {
        throw invalid(`reachable key '${reachable.key}' has no runnable Schema definition (path: ${reachable.path.join(" → ")})`);
    }
    const policy = appliedPolicyOf(reachable.definition);
    if (policy === undefined) {
        throw invalid(`reachable schema '${reachable.key}' has no applied policy (path: ${reachable.path.join(" → ")})`);
    }
    const catalog = CatalogId.make(reachable.definition.key);
    const schema = completeSchema(reachable.definition);
    const creationSnapshots = Object.freeze(Object.values(schema.entities)
        .sort((left, right) => compareText(left.ns, right.ns))
        .map((entity) => {
        const metadata = metadataByEntity.get(entity.ns);
        if (metadata === undefined) {
            throw invalid(`missing resolved binding metadata for entity '${entity.ns}'`);
        }
        return compileCreationPlan(entity, metadata, artifactHash);
    }));
    const creationPlans = Object.freeze(creationSnapshots.map((snapshot) => snapshot.plan));
    const creationDefaultBindings = Object.freeze(creationSnapshots.flatMap((snapshot) => snapshot.defaults));
    const operationSnapshots = Result.getOrThrow(snapshotOwnedOperations(catalog, [schema], artifactHash));
    return Object.freeze({
        catalog,
        key: reachable.definition.key,
        path: Object.freeze([...reachable.path]),
        policy,
        descriptorTables: Object.freeze(descriptorTables(catalog, schema, [])),
        creationPlans,
        creationDefaultBindings,
        creationHashMaterial: Object.freeze(creationHashMaterial(artifactHash, creationPlans)),
        operationSnapshots,
    });
};
const assembleOne = Effect.fn("Authorization.assembleCatalogDefinition")(function* (snapshot) {
    const authoredPolicy = yield* compileReadAuthorization(snapshot.policy);
    const template = yield* Effect.fromResult(decodePolicyTemplateResult(authoredPolicy));
    const lowered = yield* lowerOwnedOperationSnapshots(snapshot.operationSnapshots);
    const tables = {
        ...snapshot.descriptorTables,
        operations: lowered.descriptors,
    };
    const version = CatalogVersion.make(yield* hashDomainSeparatedCanonicalJson(CATALOG_DEFINITION_VERSION_DOMAIN, snapshot.creationHashMaterial));
    const descriptorWithoutFingerprint = {
        ...tables,
        database: DatabaseId.make(`catalog-definition:${snapshot.key}`),
        version,
        fingerprint: SchemaFingerprint.make("pending"),
    };
    const fingerprint = yield* hashCatalogSchemaFingerprint(descriptorWithoutFingerprint);
    const descriptor = {
        ...descriptorWithoutFingerprint,
        fingerprint,
    };
    const policy = yield* installAuthorization({
        target: {
            database: descriptor.database,
            catalog: snapshot.catalog,
            catalogVersion: descriptor.version,
            schemaFingerprint: descriptor.fingerprint,
        },
        descriptor,
        template,
    });
    const unit = yield* sealInstalledCatalogUnit(descriptor, policy);
    const operations = yield* Effect.fromResult(pairDeployedOperations(unit.catalog.operations, lowered.definitions));
    const creationDefaults = yield* fromPure("creation default binding failed", () => pairDeployedCreationDefaults(snapshot.creationPlans, snapshot.creationDefaultBindings));
    const composition = yield* Effect.fromResult(compositionFromUnit(unit));
    const creationByEntity = new Map(snapshot.creationPlans.map((plan) => [plan.entity, plan]));
    const catalogKeyText = snapshot.key;
    const resolveCreationValues = Object.freeze((entityName, input, context, options = {}) => {
        const plan = creationByEntity.get(entityName);
        if (plan === undefined) {
            throw new Error(`ramose/create: unknown entity ${JSON.stringify(entityName)} in catalog ${JSON.stringify(catalogKeyText)}`);
        }
        return resolveCompiledCreationValues(plan, input, context, creationDefaults, options);
    });
    const requireFieldRuntime = Object.freeze((entityName, fieldIdent) => {
        const plan = creationByEntity.get(entityName);
        const field = plan?.fields.find((candidate) => candidate.ident === fieldIdent);
        if (field === undefined) {
            throw new Error(`ramose/operation: field ${JSON.stringify(fieldIdent)} is not deployed for entity ${JSON.stringify(entityName)}`);
        }
        return Object.freeze({
            cardinality: field.cardinality,
            validate: (value) => {
                field.encoder(value);
            },
            fixed: field.fixed === undefined
                ? Object.freeze({ _tag: "mutable" })
                : Object.freeze({
                    _tag: "fixed",
                    value: cloneBindingValue(field.fixed),
                }),
        });
    });
    const fieldValidators = new Map();
    for (const plan of snapshot.creationPlans) {
        for (const field of plan.fields) {
            if (!fieldValidators.has(field.ident)) {
                fieldValidators.set(field.ident, field.encoder);
            }
        }
    }
    const validateFieldValue = Object.freeze((fieldIdent, value) => {
        const validate = fieldValidators.get(fieldIdent);
        if (validate === undefined) {
            throw new Error(`ramose/operation: field ${JSON.stringify(fieldIdent)} has no deployed codec`);
        }
        validate(value);
    });
    return Object.freeze({
        catalogKey: snapshot.catalog,
        unitHash: unit.unitHash,
        unit,
        composition,
        operations,
        path: snapshot.path,
        resolveCreationValues,
        requireFieldRuntime,
        validateFieldValue,
    });
});
const buildRegistry = (root, byKey) => Object.freeze({
    root,
    require: (catalogKey) => {
        const found = byKey.get(catalogKey);
        return found === undefined
            ? Result.fail(new CatalogMismatch({ message: "catalog definition mismatch" }))
            : Result.succeed(found);
    },
    keys: () => Object.freeze([...byKey.keys()].sort(compareText)),
});
export const resolveCatalogDefinition = (definitions, ref) => Result.gen(function* () {
    const definition = yield* definitions.require(ref.catalogKey);
    yield* requireUnitHash(ref.unitHash, definition.unitHash, definition.catalogKey);
    return definition;
});
export const assembleCatalogDefinitions = Effect.fn("Authorization.assembleCatalogDefinitions")(function* (input) {
    if (!/^[0-9a-f]{64}$/.test(input.artifactHash)) {
        return yield* invalid("catalog artifact hash must be 64 lowercase hexadecimal characters");
    }
    const reachability = yield* fromPure("catalog definition reachability failed", () => collectCodeReachability(input.root));
    const snapshots = yield* fromPure("catalog definition authoring snapshot failed", () => reachability.definitions.map((reachable) => {
        const metadataByEntity = new Map();
        for (const creation of reachability.creation) {
            if (creation.catalogKey === reachable.key) {
                metadataByEntity.set(creation.entity, creation.metadata);
            }
        }
        return normalizeDefinitionSnapshot(reachable, input.artifactHash, metadataByEntity);
    }));
    const byKey = new Map();
    for (const snapshot of snapshots) {
        const assembled = yield* assembleOne(snapshot);
        byKey.set(assembled.catalogKey, assembled);
    }
    return buildRegistry(CatalogId.make(reachability.root.key), Object.freeze(byKey));
});
export const deployCatalogDefinitions = (definitions, deployments) => Result.gen(function* () {
    const byDatabase = new Map();
    const readCatalogs = new Map();
    for (const deployment of deployments) {
        if (byDatabase.has(deployment.database)) {
            return yield* Result.fail(new InvalidIR({
                message: `duplicate deployed catalog definition for database '${deployment.database}'`,
            }));
        }
        const definition = yield* definitions.require(deployment.catalogKey);
        const bound = Object.freeze({
            database: deployment.database,
            definition,
        });
        byDatabase.set(deployment.database, bound);
        readCatalogs.set(deployment.database, Object.freeze({
            database: deployment.database,
            catalogKey: definition.catalogKey,
            unitHash: definition.unitHash,
            unit: definition.unit,
            composition: definition.composition,
        }));
    }
    const databases = () => Object.freeze([...byDatabase.keys()].sort(compareText));
    const requireDatabase = (database) => {
        const found = byDatabase.get(database);
        return found === undefined
            ? Result.fail(new CatalogMismatch({
                message: "catalog mismatch",
                expectedDatabase: database,
            }))
            : Result.succeed(found);
    };
    const catalogs = Object.freeze({
        requireDatabase: (database) => {
            const found = readCatalogs.get(database);
            return found === undefined
                ? Result.fail(new CatalogMismatch({
                    message: "catalog mismatch",
                    expectedDatabase: database,
                }))
                : Result.succeed(found);
        },
        databases,
    });
    return Object.freeze({ catalogs, requireDatabase, databases });
});
export const resolveDeployedCatalogDefinition = (deployed, ref) => Result.gen(function* () {
    const found = yield* deployed.requireDatabase(ref.database);
    yield* requireCatalogKey(ref.catalogKey, found.definition.catalogKey);
    yield* requireUnitHash(ref.unitHash, found.definition.unitHash, found.definition.catalogKey);
    return found;
});
//# sourceMappingURL=definitions.js.map