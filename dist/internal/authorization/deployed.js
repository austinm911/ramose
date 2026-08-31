import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { Unauthorized } from "../../db/Errors.js";
import { compositionFromUnit } from "./composition.js";
import { sealInstalledCatalogUnit, } from "./catalog-unit.js";
import { CatalogMismatch, CatalogUnitCorrupt, CatalogVersionMismatch, InvalidIR } from "./failures.js";
import { installAuthorization } from "./install.js";
const freezePlain = (value) => {
    if (value === null || typeof value !== "object" || Object.isFrozen(value))
        return value;
    if (Array.isArray(value)) {
        for (const item of value)
            freezePlain(item);
    }
    else {
        for (const key of Object.keys(value)) {
            freezePlain(value[key]);
        }
    }
    return Object.freeze(value);
};
const invalid = (message) => Result.fail(new InvalidIR({ message }));
const formatPath = (path) => path.join(" → ");
const compareCatalogId = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const compareDatabaseId = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const catalogTargetOf = (descriptor) => ({
    database: descriptor.database,
    catalog: descriptor.id,
    catalogVersion: descriptor.version,
    schemaFingerprint: descriptor.fingerprint,
});
const assembleOne = Effect.fn("Authorization.assembleOneDeployedCatalog")(function* (unit) {
    const descriptor = unit.descriptor;
    if (descriptor.id !== unit.catalog) {
        return yield* new InvalidIR({
            message: `catalog '${unit.catalog}' descriptor id '${descriptor.id}' does not match the assembly key`,
        });
    }
    if (descriptor.database !== unit.database) {
        return yield* new InvalidIR({
            message: `catalog '${unit.catalog}' descriptor database does not match the assembly key`,
        });
    }
    if (descriptor.version !== unit.version) {
        return yield* new InvalidIR({
            message: `catalog '${unit.catalog}' descriptor version does not match the assembly key`,
        });
    }
    const policy = yield* installAuthorization({
        target: catalogTargetOf(descriptor),
        descriptor,
        template: unit.policy,
    });
    const sealed = yield* sealInstalledCatalogUnit(descriptor, policy);
    const composition = yield* Effect.fromResult(compositionFromUnit(sealed));
    return freezePlain({
        database: unit.database,
        catalogKey: unit.catalog,
        unitHash: sealed.unitHash,
        unit: sealed,
        composition,
    });
});
const buildRegistry = (byDatabase) => {
    const requireDatabase = (database) => {
        const deployed = byDatabase.get(database);
        if (deployed === undefined) {
            return Result.fail(new CatalogMismatch({
                message: "catalog mismatch",
                expectedDatabase: database,
            }));
        }
        return Result.succeed(deployed);
    };
    const databases = () => Object.freeze([...byDatabase.keys()].sort(compareDatabaseId));
    return Object.freeze({
        requireDatabase,
        databases,
    });
};
export const requireCatalogKey = (actual, expected) => {
    if (actual === expected)
        return Result.succeed(undefined);
    return Result.fail(new CatalogMismatch({
        message: "catalog mismatch",
        expected,
        actual,
    }));
};
export const requireUnitHash = (actual, expected, catalog) => {
    if (actual === expected)
        return Result.succeed(undefined);
    return Result.fail(new CatalogVersionMismatch({ catalog, expected, actual }));
};
export const resolveDeployedCatalog = (catalogs, ref) => Result.gen(function* () {
    const deployed = yield* catalogs.requireDatabase(ref.database);
    yield* requireCatalogKey(ref.catalogKey, deployed.catalogKey);
    yield* requireUnitHash(ref.unitHash, deployed.unitHash, deployed.catalogKey);
    return deployed;
});
export const opaqueCatalogDenial = (_error) => new Unauthorized({});
export const assembleDeployedCatalogs = Effect.fn("Authorization.assembleDeployedCatalogs")(function* (input) {
    const sources = new Map();
    for (const unit of input.units) {
        const existing = sources.get(unit.catalog);
        if (existing === undefined)
            sources.set(unit.catalog, [unit]);
        else
            existing.push(unit);
    }
    const reachable = new Map();
    const visit = (key, path) => Result.gen(function* () {
        if (path.includes(key)) {
            return yield* invalid(`catalog reachability cycle: ${formatPath([...path, key])}`);
        }
        const listed = sources.get(key);
        if (listed === undefined) {
            return yield* invalid(`missing child catalog '${key}' (path: ${formatPath([...path, key])})`);
        }
        const nextPath = [...path, key];
        const paths = reachable.get(key);
        if (paths === undefined)
            reachable.set(key, [nextPath]);
        else
            reachable.set(key, [...paths, nextPath]);
        if (paths !== undefined)
            return;
        const children = [...new Set(listed.flatMap((unit) => unit.children ?? []))].sort(compareCatalogId);
        for (const child of children) {
            yield* visit(child, nextPath);
        }
    });
    yield* Effect.fromResult(visit(input.root, []));
    for (const key of sources.keys()) {
        if (!reachable.has(key)) {
            return yield* new InvalidIR({
                message: `unused catalog '${key}' is not reachable from root '${input.root}'`,
            });
        }
    }
    const byKey = new Map();
    const ordered = [...reachable.keys()].sort(compareCatalogId);
    for (const key of ordered) {
        const listed = sources.get(key);
        if (listed === undefined) {
            return yield* new InvalidIR({
                message: `missing child catalog '${key}'`,
            });
        }
        const assembled = [];
        for (const unit of listed) {
            assembled.push(yield* assembleOne(unit));
        }
        const hashes = new Set(assembled.map((item) => item.unitHash));
        if (hashes.size > 1) {
            const paths = (reachable.get(key) ?? []).map(formatPath).join("; ");
            return yield* new InvalidIR({
                message: `duplicate catalog '${key}' with conflicting unit hashes (paths: ${paths})`,
            });
        }
        byKey.set(key, assembled[0]);
    }
    const byDatabase = new Map();
    const deployedUnits = [...byKey.values()].sort((left, right) => compareCatalogId(left.catalogKey, right.catalogKey));
    for (const deployed of deployedUnits) {
        const existing = byDatabase.get(deployed.database);
        if (existing === undefined) {
            byDatabase.set(deployed.database, deployed);
            continue;
        }
        if (existing.catalogKey === deployed.catalogKey &&
            existing.unitHash === deployed.unitHash) {
            continue;
        }
        const catalogPaths = [existing.catalogKey, deployed.catalogKey]
            .map((key) => (reachable.get(key) ?? []).map(formatPath).join("; "))
            .join("; ");
        return yield* new InvalidIR({
            message: `distinct catalog units '${existing.catalogKey}' and '${deployed.catalogKey}' claim database '${deployed.database}' (paths: ${catalogPaths})`,
        });
    }
    return buildRegistry(Object.freeze(byDatabase));
});
//# sourceMappingURL=deployed.js.map