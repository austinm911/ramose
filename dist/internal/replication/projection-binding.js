import { normalizeProjectionRevision, } from "../../db/Projection.js";
const MAX_BUILD_LENGTH = 256;
const CONTROL_CHARACTERS = /\p{Cc}/u;
const invalid = (detail) => {
    throw new Error(`ramose/projection: ${detail}`);
};
export const projectionOperationKey = (operation) => JSON.stringify([
    operation.catalog,
    operation.owner.kind,
    operation.owner.name,
    operation.localName,
]);
export const projectionBuild = (value) => {
    if (typeof value !== "string" || value.length === 0 ||
        value.length > MAX_BUILD_LENGTH ||
        CONTROL_CHARACTERS.test(value)) {
        invalid("a client build identity must be non-empty printable text of at most 256 characters");
    }
    return value;
};
export const projectionIdentity = (build, revision) => Object.freeze({
    revision: normalizeProjectionRevision(revision),
    build: projectionBuild(build),
});
export const makeClientProjectionCatalog = (build, installed) => {
    const entries = new Map();
    for (const entry of installed) {
        const key = projectionOperationKey(entry.operation);
        if (entries.has(key)) {
            invalid(`two installed operations share the identity ${key}`);
        }
        if (entry.projection === undefined) {
            entries.set(key, entry);
            continue;
        }
        if (typeof entry.projection.run !== "function") {
            invalid(`${key} declares a projection that is not a function`);
        }
        entries.set(key, Object.freeze({
            operation: entry.operation,
            projection: Object.freeze({
                revision: normalizeProjectionRevision(entry.projection.revision),
                run: entry.projection.run,
            }),
        }));
    }
    return Object.freeze({
        build: projectionBuild(build),
        entries,
    });
};
export const resolveProjectionBinding = (catalog, stored) => {
    if (stored.projection === null)
        return NONE;
    const entry = catalog.entries.get(projectionOperationKey(stored.operation));
    if (entry === undefined)
        return drift("operation-missing");
    const installed = entry.projection;
    if (installed === undefined)
        return drift("projection-missing");
    if (installed.revision !== stored.projection.revision) {
        return drift("projection-revision");
    }
    return Object.freeze({
        type: "bound",
        identity: Object.freeze({
            revision: installed.revision,
            build: catalog.build,
        }),
        rebound: catalog.build !== stored.projection.build,
        run: installed.run,
    });
};
const NONE = Object.freeze({ type: "none" });
const drift = (reason) => Object.freeze({ type: "update-required", reason });
//# sourceMappingURL=projection-binding.js.map