import * as Data from "effect/Data";
import * as Result from "effect/Result";
import { ENTITY_ID_PATTERN } from "../../db/refs.js";
import { COMPARATORS, IndexName } from "../core/datom.js";
import { FIRST_USER_EID, Schema } from "../core/schema.js";
import { NodeKind } from "../core/tree.js";
import { REPLICA_STORAGE_VERSION, } from "./protocol.js";
import { replicaBootstrapDatoms, replicaFactDatom, replicaSchema, } from "./replica-schema.js";
export const replicaRecoveryAction = (reason) => reason === "read-compatibility" || reason === "schema-metadata"
    ? "update-required"
    : "replacement-required";
const failure = (reason, detail, located) => Object.freeze({
    reason,
    detail,
    ...(located?.index === undefined ? {} : { index: located.index }),
    ...(located?.hash === undefined ? {} : { hash: located.hash }),
});
export class ReplicaCorruptError extends Data.TaggedError("ReplicaCorruptError") {
}
export const replicaRestored = (replica) => Object.freeze({ _tag: "restored", replica });
export const replicaAbsent = () => Object.freeze({ _tag: "absent" });
export const replicaContended = (partition, attempts) => Object.freeze({ _tag: "contended", partition, attempts });
export const replicaUnusable = (partition, reason, detail) => Object.freeze({
    _tag: replicaRecoveryAction(reason),
    partition,
    reason,
    detail,
});
export const restoredReplica = (outcome) => outcome._tag === "restored" ? outcome.replica : undefined;
export const replicaRefused = (outcome) => outcome._tag === "replacement-required" || outcome._tag === "update-required";
const HEX_64 = /^[0-9a-f]{64}$/;
const isCount = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
export const validateReplicaNodeRef = (ref, where, index) => {
    if (!isRecord(ref))
        return failure("manifest-undecodable", `${where} is not a node reference`, { index });
    if (typeof ref.hash !== "string" || !HEX_64.test(ref.hash)) {
        return failure("manifest-undecodable", `${where} has no content address`, { index });
    }
    if (ref.kind !== NodeKind.Leaf && ref.kind !== NodeKind.Dir) {
        return failure("node-kind", `${where} declares an unknown node kind`, {
            index,
            hash: ref.hash,
        });
    }
    if (!isCount(ref.count)) {
        return failure("node-invariant", `${where} has no subtree count`, {
            index,
            hash: ref.hash,
        });
    }
    return undefined;
};
export const validateReplicaRoots = (roots) => {
    if (!isRecord(roots))
        return failure("manifest-undecodable", "manifest has no roots");
    if (!isCount(roots.t))
        return failure("manifest-undecodable", "roots carry no basis");
    for (const [name, index] of [["eavt", 0], ["aevt", 1], ["avet", 2], ["vaet", 3]]) {
        const invalid = validateReplicaNodeRef(roots[name], `root ${name}`, index);
        if (invalid !== undefined)
            return invalid;
    }
    const counts = roots;
    if (counts.eavt.count !== counts.aevt.count) {
        return failure("manifest-invariant", "eavt and aevt index different datom counts");
    }
    for (const name of ["avet", "vaet"]) {
        if (counts[name].count > counts.eavt.count) {
            return failure("manifest-invariant", `${name} indexes more datoms than eavt`);
        }
    }
    return undefined;
};
const isReplicationIdentityShape = (value) => isRecord(value) && value.version === 1 &&
    ["server", "principal", "database", "catalog", "readView", "readCompatibilityHash",
        "authenticator"].every((field) => typeof value[field] === "string") &&
    Array.isArray(value.graphLineage) &&
    value.graphLineage.every((entity) => typeof entity === "string");
export const replicaManifestIdentity = (record) => isRecord(record) && isReplicationIdentityShape(record.identity)
    ? record.identity
    : undefined;
export const replicaManifestFingerprint = (record) => {
    const manifest = isRecord(record) ? record : {};
    const roots = isRecord(manifest.roots) ? manifest.roots : {};
    const size = (value) => Array.isArray(value) ? value.length : -1;
    return JSON.stringify([
        typeof manifest.revision === "string" ? manifest.revision : null,
        ...["eavt", "aevt", "avet", "vaet"].map((name) => {
            const ref = roots[name];
            return isRecord(ref) && typeof ref.hash === "string" ? ref.hash : null;
        }),
        typeof manifest.installId === "string" ? manifest.installId : null,
        typeof roots.t === "number" ? roots.t : null,
        typeof manifest.nextLocalId === "number" ? manifest.nextLocalId : null,
        size(manifest.datoms),
        size(manifest.attributes),
        size(manifest.entityIds),
        size(manifest.attributeIds),
    ]);
};
const isLogicalValue = (value) => {
    if (!isRecord(value))
        return false;
    switch (value.type) {
        case "long":
        case "instant":
            return typeof value.value === "number" && Number.isSafeInteger(value.value);
        case "double":
            return (typeof value.value === "number" && Number.isFinite(value.value)) ||
                value.value === "positive-infinity" || value.value === "negative-infinity";
        case "boolean":
            return typeof value.value === "boolean";
        case "string":
        case "ref":
        case "uuid":
            return typeof value.value === "string";
        case "bytes":
            return typeof value.value === "string" && isCanonicalBase64(value.value);
        default:
            return false;
    }
};
const isCanonicalBase64 = (value) => {
    try {
        return btoa(atob(value)) === value;
    }
    catch {
        return false;
    }
};
const localIds = (entries, what) => {
    if (!Array.isArray(entries)) {
        return Result.fail(failure("manifest-undecodable", `manifest has no ${what} map`));
    }
    const map = new Map();
    const used = new Set();
    for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2) {
            return Result.fail(failure("manifest-undecodable", `malformed ${what} entry`));
        }
        const [name, id] = entry;
        if (typeof name !== "string" || !isCount(id)) {
            return Result.fail(failure("manifest-undecodable", `malformed ${what} entry`));
        }
        if (id < FIRST_USER_EID) {
            return Result.fail(failure("manifest-invariant", `${what} ${name} is a reserved local id`));
        }
        if (map.has(name)) {
            return Result.fail(failure("manifest-invariant", `duplicate ${what} ${name}`));
        }
        if (used.has(id)) {
            return Result.fail(failure("manifest-invariant", `${what} ${name} reuses a local id`));
        }
        map.set(name, id);
        used.add(id);
    }
    return Result.succeed(map);
};
const sealedHandles = (entries) => {
    if (!Array.isArray(entries)) {
        return Result.fail(failure("manifest-undecodable", "manifest has no entity handle map"));
    }
    const map = new Map();
    const used = new Set();
    for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2) {
            return Result.fail(failure("manifest-undecodable", "malformed entity handle entry"));
        }
        const [identity, handle] = entry;
        if (typeof identity !== "string" || typeof handle !== "string") {
            return Result.fail(failure("manifest-undecodable", "malformed entity handle entry"));
        }
        if (!ENTITY_ID_PATTERN.test(handle)) {
            return Result.fail(failure("manifest-undecodable", `entity handle for ${identity} is not a sealed handle`));
        }
        if (map.has(identity)) {
            return Result.fail(failure("manifest-invariant", `duplicate entity handle ${identity}`));
        }
        if (used.has(handle)) {
            return Result.fail(failure("manifest-invariant", `entity handle ${identity} reuses another entity's handle`));
        }
        map.set(identity, handle);
        used.add(handle);
    }
    return Result.succeed(map);
};
export const validateReplicaManifest = (record, expected) => Result.gen(function* () {
    if (!isRecord(record)) {
        return yield* Result.fail(failure("manifest-undecodable", "manifest is not a record"));
    }
    if (record.storageVersion !== REPLICA_STORAGE_VERSION) {
        return yield* Result.fail(failure("manifest-invariant", "manifest is not this storage version"));
    }
    if (record.partition !== expected.partition) {
        return yield* Result.fail(failure("manifest-invariant", "manifest is stored under another partition"));
    }
    const identity = record.identity;
    if (!isReplicationIdentityShape(identity) || typeof record.revision !== "string") {
        return yield* Result.fail(failure("manifest-undecodable", "manifest has no complete identity or revision"));
    }
    if (record.readCompatibilityHash !== identity.readCompatibilityHash ||
        record.readCompatibilityHash !== expected.readCompatibilityHash) {
        return yield* Result.fail(failure("manifest-invariant", "manifest does not confirm this read compatibility"));
    }
    if (!Array.isArray(record.datoms) || !Array.isArray(record.attributes)) {
        return yield* Result.fail(failure("manifest-undecodable", "manifest has no datoms or attributes"));
    }
    const rootsInvalid = validateReplicaRoots(record.roots);
    if (rootsInvalid !== undefined)
        return yield* Result.fail(rootsInvalid);
    if (!isCount(record.nextLocalId) || record.nextLocalId < FIRST_USER_EID) {
        return yield* Result.fail(failure("manifest-invariant", "manifest has no local id allocator"));
    }
    const entities = yield* localIds(record.entityIds, "entity id");
    const handles = yield* sealedHandles(record.entityHandles);
    const attributeIds = yield* localIds(record.attributeIds, "attribute id");
    const allocated = new Set();
    for (const [what, ids] of [["entity", entities], ["attribute", attributeIds]]) {
        for (const [name, id] of ids) {
            if (id >= record.nextLocalId) {
                return yield* Result.fail(failure("manifest-invariant", `${what} ${name} was never allocated`));
            }
            if (allocated.has(id)) {
                return yield* Result.fail(failure("manifest-invariant", `${what} ${name} reuses a local id`));
            }
            allocated.add(id);
        }
    }
    const bootstrap = Schema.bootstrap();
    for (const spec of record.attributes) {
        if (!isRecord(spec) || typeof spec.ident !== "string" ||
            typeof spec.valueType !== "number" ||
            (spec.cardinality !== "one" && spec.cardinality !== "many") ||
            typeof spec.index !== "boolean" || typeof spec.isComponent !== "boolean" ||
            typeof spec.optional !== "boolean" ||
            (spec.unique !== undefined && spec.unique !== "identity" && spec.unique !== "value")) {
            return yield* Result.fail(failure("manifest-undecodable", "malformed replica attribute"));
        }
        if (bootstrap.attr(spec.ident) === undefined && !attributeIds.has(spec.ident)) {
            return yield* Result.fail(failure("manifest-invariant", `attribute ${spec.ident} has no local id`));
        }
    }
    for (const datom of record.datoms) {
        if (!isRecord(datom) || typeof datom.entity !== "string" ||
            typeof datom.field !== "string" || datom.op !== "add" ||
            !isLogicalValue(datom.value)) {
            return yield* Result.fail(failure("manifest-undecodable", "malformed logical datom"));
        }
        if (!entities.has(datom.entity)) {
            return yield* Result.fail(failure("manifest-invariant", `fact entity ${datom.entity} has no local id`));
        }
        if (!handles.has(datom.entity)) {
            return yield* Result.fail(failure("manifest-invariant", `fact entity ${datom.entity} has no sealed handle`));
        }
        if (bootstrap.attr(datom.field) === undefined && !attributeIds.has(datom.field)) {
            return yield* Result.fail(failure("manifest-invariant", `fact field ${datom.field} has no local id`));
        }
        if (datom.value.type === "ref") {
            const target = datom.value.value;
            if (!entities.has(target)) {
                return yield* Result.fail(failure("manifest-invariant", "logical reference has no local entity"));
            }
            if (!handles.has(target)) {
                return yield* Result.fail(failure("manifest-invariant", "logical reference has no sealed handle"));
            }
        }
    }
    return record;
});
export const emptyReplicaIndexDigest = () => ({ datoms: 0, sum: 0, xor: 0, basis: 0 });
const FNV_PRIME = 0x01000193;
const FNV_OFFSET = 0x811c9dc5;
const mix = (hash, word) => Math.imul(hash ^ (word >>> 0), FNV_PRIME) >>> 0;
const scratch = new DataView(new ArrayBuffer(8));
const mixNumber = (hash, value) => {
    scratch.setFloat64(0, value);
    return mix(mix(hash, scratch.getUint32(0)), scratch.getUint32(4));
};
const mixString = (hash, value) => {
    let mixed = mix(hash, value.length);
    for (let i = 0; i < value.length; i++)
        mixed = mix(mixed, value.charCodeAt(i));
    return mixed;
};
const datomHash = (datom) => {
    let hash = mix(mix(mix(mix(FNV_OFFSET, datom.e), datom.a), datom.t), datom.vt);
    hash = mix(hash, datom.op ? 1 : 0);
    const value = datom.v;
    if (typeof value === "number")
        return mixNumber(hash, value);
    if (typeof value === "string")
        return mixString(hash, value);
    if (typeof value === "boolean")
        return mix(hash, value ? 1 : 0);
    let mixed = mix(hash, value.length);
    for (let i = 0; i < value.length; i++)
        mixed = mix(mixed, value[i]);
    return mixed;
};
export const digestReplicaDatoms = (digest, datoms) => {
    for (const datom of datoms) {
        const hash = datomHash(datom);
        digest.datoms++;
        digest.sum = (digest.sum + hash) >>> 0;
        digest.xor = (digest.xor ^ hash) >>> 0;
        if (datom.t > digest.basis)
            digest.basis = datom.t;
    }
};
export const sameReplicaIndexContents = (left, right) => left.datoms === right.datoms && left.sum === right.sum && left.xor === right.xor &&
    left.basis === right.basis;
const emptyDigests = () => ({
    0: emptyReplicaIndexDigest(),
    1: emptyReplicaIndexDigest(),
    2: emptyReplicaIndexDigest(),
    3: emptyReplicaIndexDigest(),
});
export const expectedReplicaContents = (manifest) => {
    const entities = new Map(manifest.entityIds);
    const built = replicaSchema(manifest.attributes, new Map(manifest.attributeIds));
    if (built === undefined) {
        return Result.fail(failure("manifest-invariant", "a stored attribute has no local id"));
    }
    const digests = emptyDigests();
    const fold = (datom) => {
        digestReplicaDatoms(digests[0], [datom]);
        digestReplicaDatoms(digests[1], [datom]);
        if (built.schema.isAvet(datom.a))
            digestReplicaDatoms(digests[2], [datom]);
        if (built.schema.isVaet(datom.a))
            digestReplicaDatoms(digests[3], [datom]);
    };
    try {
        for (const datom of replicaBootstrapDatoms())
            fold(datom);
        for (const datom of built.datoms)
            fold(datom);
        for (const logical of manifest.datoms) {
            const fact = replicaFactDatom(logical, built.schema, entities);
            if (typeof fact === "string") {
                return Result.fail(failure("manifest-invariant", `stored fact on ${logical.field} cannot be materialized`));
            }
            fold(fact);
        }
    }
    catch {
        return Result.fail(failure("manifest-undecodable", "a stored fact cannot be materialized"));
    }
    return Result.succeed(digests);
};
export const validateReplicaContents = (roots, walked, expected) => {
    for (const index of [0, 1, 2, 3]) {
        if (!sameReplicaIndexContents(walked[index], expected[index])) {
            return failure("manifest-invariant", `${IndexName[index]} does not hold the datoms this manifest describes`, { index });
        }
    }
    if (roots.t !== expected[0].basis) {
        return failure("manifest-invariant", "the manifest basis is not the indexed basis");
    }
    return undefined;
};
const nodeCount = (node) => {
    if (node.kind === NodeKind.Leaf)
        return node.datoms.length;
    let total = 0;
    for (const ref of node.refs)
        total += ref.count;
    return total;
};
export const validateReplicaNode = (index, ref, decoded, expectedKey) => {
    const located = { index, hash: ref.hash };
    if (decoded.index !== index) {
        return failure("node-kind", `node belongs to index ${decoded.index}, not ${IndexName[index]}`, located);
    }
    const node = decoded.node;
    if (node.kind !== ref.kind)
        return failure("node-kind", "node kind is not the referenced kind", located);
    if (nodeCount(node) !== ref.count) {
        return failure("node-invariant", "node does not hold the referenced datom count", located);
    }
    const comparator = COMPARATORS[index];
    const smallest = node.kind === NodeKind.Leaf ? node.datoms[0] : node.keys[0];
    if (expectedKey !== undefined) {
        if (smallest === undefined) {
            return failure("node-invariant", "a linked subtree holds no datoms", located);
        }
        if (comparator(expectedKey, smallest) !== 0) {
            return failure("node-invariant", "directory separator is not the first datom of its subtree", located);
        }
    }
    if (node.kind === NodeKind.Leaf) {
        for (let i = 1; i < node.datoms.length; i++) {
            if (comparator(node.datoms[i - 1], node.datoms[i]) >= 0) {
                return failure("node-invariant", "leaf datoms are not in index order", located);
            }
        }
        return undefined;
    }
    if (node.refs.length !== node.keys.length) {
        return failure("node-invariant", "directory keys and children disagree", located);
    }
    if (node.refs.length === 0)
        return failure("node-invariant", "directory has no children", located);
    for (let i = 0; i < node.refs.length; i++) {
        const invalid = validateReplicaNodeRef(node.refs[i], `child ${i}`, index);
        if (invalid !== undefined)
            return invalid;
        if (i > 0 && comparator(node.keys[i - 1], node.keys[i]) >= 0) {
            return failure("node-invariant", "directory keys are not in index order", located);
        }
    }
    return undefined;
};
//# sourceMappingURL=replica-integrity.js.map