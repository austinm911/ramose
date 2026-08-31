import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { reachableTraits } from "../db/compose.js";
import { isOwnedOperation, OwnedOperations, } from "../db/Operation.js";
import { normalizeProjectionRevision, } from "../db/Projection.js";
import { snapshotOwnedOperations, } from "../internal/authorization/authoring/operations.js";
import { inputEntityRefHandles } from "../internal/authorization/entity-targets.js";
import { CatalogId, DigestHex, } from "../internal/authorization/identities.js";
import { hashOperationVersion } from "../internal/authorization/operation-version.js";
const NO_ARTIFACT = DigestHex.make("0".repeat(64));
const ownerKey = (owner) => `${owner.kind}\u0000${owner.name}`;
const invalid = (detail) => {
    throw new Error(`ramose/client: ${detail}`);
};
const authoredOperations = (schema) => {
    const entities = Object.values(schema.entities);
    const owners = [
        ...entities.map((entity) => ({ kind: "entity", owner: entity })),
        ...[...reachableTraits(entities).values()]
            .map((trait) => ({ kind: "trait", owner: trait })),
    ];
    const authored = new Map();
    for (const { kind, owner } of owners) {
        const declared = owner[OwnedOperations] ?? {};
        for (const [localName, candidate] of Object.entries(declared)) {
            if (!isOwnedOperation(candidate))
                continue;
            const name = owner.ns;
            authored.set(`${kind} ${name} ${localName}`, candidate);
        }
    }
    return authored;
};
const maskedRef = (index) => -(index + 1);
const readPath = (value, path) => path.reduce((cursor, segment) => cursor === null || typeof cursor !== "object"
    ? undefined
    : cursor[segment], value);
const writePath = (value, path, replacement) => {
    const [segment, ...rest] = path;
    if (segment === undefined)
        return replacement;
    const child = writePath(readPath(value, [segment]), rest, replacement);
    if (typeof segment === "number") {
        return value.map((item, index) => index === segment ? child : item);
    }
    return { ...value, [segment]: child };
};
const encodeInput = (snapshot, input) => {
    const handles = inputEntityRefHandles(snapshot.inputShape, input);
    if (handles.length === 0)
        return snapshot.inputCodec.encode(input);
    const masked = handles.reduce((value, path, index) => writePath(value, path, maskedRef(index)), input);
    return handles.reduce((value, path, index) => {
        if (readPath(value, path) !== maskedRef(index)) {
            invalid(`${snapshot.owner.name}.${snapshot.localName} moved the entity ` +
                `reference at '${path.join(".")}' while encoding`);
        }
        return writePath(value, path, readPath(input, path));
    }, snapshot.inputCodec.encode(masked));
};
const clientOperation = (snapshot, authored) => {
    const declaration = authored.get(`${snapshot.owner.kind} ${snapshot.owner.name} ${snapshot.localName}`);
    const projection = declaration?.optimistic;
    let version;
    return {
        owner: snapshot.owner,
        localName: snapshot.localName,
        self: snapshot.self,
        version: () => {
            version ??= Effect.runPromise(hashOperationVersion(snapshot.versionDescriptor));
            return version;
        },
        allocations: snapshot.versionDescriptor.allocations,
        composers: snapshot.composers.map((entity) => entity.name),
        input: snapshot.inputShape,
        encode: (input) => encodeInput(snapshot, input),
        optimistic: projection === undefined ? undefined : {
            revision: normalizeProjectionRevision(declaration?.optimisticRevision),
            run: projection,
        },
    };
};
export const installClientOperations = (definition, schema) => {
    const catalog = CatalogId.make(definition.key);
    const lowered = snapshotOwnedOperations(catalog, [schema], NO_ARTIFACT);
    if (Result.isFailure(lowered)) {
        invalid(`catalog operations could not be lowered: ${lowered.failure.message}`);
    }
    const authored = authoredOperations(schema);
    const operations = lowered.success
        .map((snapshot) => clientOperation(snapshot, authored));
    const database = new Map();
    const self = new Map();
    const installed = [];
    for (const operation of operations) {
        installed.push({
            operation: {
                catalog,
                owner: operation.owner,
                localName: operation.localName,
            },
            projection: operation.optimistic,
        });
        if (!operation.self) {
            if (database.has(operation.localName)) {
                invalid(`two catalog operations answer to db.mutate.${operation.localName}`);
            }
            database.set(operation.localName, operation);
            continue;
        }
        const key = ownerKey(operation.owner);
        const owned = self.get(key) ?? new Map();
        owned.set(operation.localName, operation);
        self.set(key, owned);
    }
    return Object.freeze({
        catalog,
        database,
        self,
        installed: Object.freeze(installed),
    });
};
export const selfOperationsFor = (operations, composition, focus) => {
    const typeName = focus.name;
    const owners = [{ kind: focus.kind, name: typeName }];
    for (const trait of focus.kind === "entity"
        ? composition.transitiveTraits(`:${typeName}`)
        : []) {
        owners.push({ kind: "trait", name: trait.startsWith(":") ? trait.slice(1) : trait });
    }
    const methods = new Map();
    for (const owner of owners) {
        for (const [name, operation] of operations.self.get(ownerKey(owner)) ?? []) {
            const existing = methods.get(name);
            if (existing !== undefined) {
                invalid(`${typeName}.mutate.${name} is declared by both ${existing.owner.kind} ` +
                    `'${existing.owner.name}' and ${owner.kind} '${owner.name}'`);
            }
            methods.set(name, operation);
        }
    }
    return methods;
};
//# sourceMappingURL=operations.js.map