import * as Data from "effect/Data";
import { isAllocationSlotName, } from "../../db/allocations.js";
import { ENTITY_ID_CODEC, entityIdEnvelope, isClientRef, isEntityId, isInvocationId, } from "../../db/refs.js";
import { canonicalizeJson, hasLoneSurrogate, } from "../authorization/canonical-json.js";
import { decideServerIdentityBinding } from "./server-identity.js";
export const MUTATION_QUEUE_VERSION = 1;
const PARTITION_DOMAIN = `ramose-mutation-v${MUTATION_QUEUE_VERSION}`;
export const mutationPartitionKey = (scope) => [PARTITION_DOMAIN, scope.server, scope.principal, scope.database].join(":");
export const mutationScopePrefix = (scope) => [PARTITION_DOMAIN, scope.server, scope.principal, ""].join(":");
export const parseMutationPartitionKey = (partition) => {
    const parts = partition.split(":");
    if (parts.length !== 4 || parts[0] !== PARTITION_DOMAIN)
        return undefined;
    if (parts[1] === "" || parts[2] === "" || parts[3] === "")
        return undefined;
    return Object.freeze({
        server: parts[1],
        principal: parts[2],
        database: parts[3],
    });
};
export const fencedByActivation = (receipt, activation) => receipt.state === "committed" && receipt.observation === "unobserved" &&
    receipt.activation < activation;
export const unobservedReceiptOf = (receipt) => receipt.state === "committed" && receipt.observation === "unobserved"
    ? Object.freeze({
        invocation: receipt.invocation,
        activation: receipt.activation,
        committedAt: receipt.updatedAt,
    })
    : undefined;
export class OutboxRecordInvalid extends Data.TaggedError("OutboxRecordInvalid") {
}
export class ClientRefConflict extends Data.TaggedError("ClientRefConflict") {
}
export class OutboxInvocationConflict extends Data.TaggedError("OutboxInvocationConflict") {
}
const reject = (reason) => {
    throw new OutboxRecordInvalid({ reason });
};
const jsonSnapshot = (value, at, seen, canonical) => {
    if (value === null)
        return null;
    switch (typeof value) {
        case "string":
            if (canonical && hasLoneSurrogate(value)) {
                reject(`input at ${at} has a lone surrogate`);
            }
            return value;
        case "boolean":
            return value;
        case "number":
            if (!Number.isFinite(value))
                reject(`input at ${at} is not a finite number`);
            return value;
        case "object":
            break;
        default:
            return reject(`input at ${at} is ${typeof value}, which is not JSON`);
    }
    const object = value;
    if (seen.has(object))
        reject(`input at ${at} is cyclic`);
    seen.add(object);
    let snapshot;
    if (Array.isArray(object)) {
        const items = [];
        for (let index = 0; index < object.length; index++) {
            if (!(index in object))
                reject(`input at ${at}[${index}] is a hole`);
            items.push(jsonSnapshot(object[index], `${at}[${index}]`, seen, canonical));
        }
        snapshot = Object.freeze(items);
    }
    else {
        const prototype = Object.getPrototypeOf(object);
        if (prototype !== Object.prototype && prototype !== null) {
            reject(`input at ${at} is not a plain object`);
        }
        const fields = [];
        for (const [key, item] of Object.entries(object)) {
            if (canonical && hasLoneSurrogate(key)) {
                reject(`input at ${at} has a lone surrogate in a key`);
            }
            fields.push([key, jsonSnapshot(item, `${at}.${key}`, seen, canonical)]);
        }
        snapshot = Object.freeze(Object.fromEntries(fields));
    }
    seen.delete(object);
    return snapshot;
};
export const sealingEpochOf = (entityId) => {
    const envelope = entityIdEnvelope(entityId);
    return envelope === undefined ? undefined : Object.freeze({
        codecVersion: envelope.codecVersion,
        keyId: envelope.keyId,
    });
};
export const sameSealingEpoch = (left, right) => left.codecVersion === right.codecVersion && left.keyId === right.keyId;
const sealedHandles = (target, inputRefs) => {
    const handles = [];
    if (target.type === "entity")
        handles.push(target.entityId);
    for (const use of inputRefs)
        if (isEntityId(use.ref))
            handles.push(use.ref);
    return handles;
};
const embeddedSealingEpoch = (target, inputRefs) => {
    let epoch = null;
    for (const handle of sealedHandles(target, inputRefs)) {
        const found = sealingEpochOf(handle);
        if (found === undefined)
            return "unreadable";
        if (epoch === null)
            epoch = found;
        else if (!sameSealingEpoch(epoch, found))
            return "mixed";
    }
    return epoch;
};
const validPathSegment = (segment) => (typeof segment === "string" && segment.length > 0) ||
    (typeof segment === "number" && Number.isSafeInteger(segment) && segment >= 0);
const validPath = (path) => path.every(validPathSegment);
const inputRefsAgree = (input, inputRefs) => {
    const positions = new Set();
    for (const use of inputRefs) {
        if (!validPath(use.path))
            return false;
        const position = JSON.stringify(use.path);
        if (positions.has(position))
            return false;
        positions.add(position);
        if (readPath(input, use.path) !== use.ref)
            return false;
    }
    return true;
};
const readPath = (input, path) => {
    let cursor = input;
    for (const segment of path) {
        if (typeof cursor !== "object" || cursor === null)
            return undefined;
        if (typeof segment === "number") {
            if (!Array.isArray(cursor) || !Object.hasOwn(cursor, segment))
                return undefined;
            cursor = cursor[segment];
        }
        else {
            if (Array.isArray(cursor) || !Object.hasOwn(cursor, segment))
                return undefined;
            cursor = cursor[segment];
        }
    }
    return cursor;
};
export const buildOutboxRecord = (draft, scopeKey, sequence) => {
    const receiver = Object.freeze({
        server: draft.receiver.server,
        principal: draft.receiver.principal,
        database: draft.receiver.database,
    });
    const partition = mutationPartitionKey(receiver);
    if (parseMutationPartitionKey(partition) === undefined) {
        reject("the receiver database does not form a reversible partition key");
    }
    if (!isInvocationId(draft.invocation)) {
        reject("the invocation id is not a durable client invocation id");
    }
    if (!isSequence(sequence)) {
        reject("the queue sequence must be a positive safe integer");
    }
    if (!isTimestamp(draft.enqueuedAt)) {
        reject("the enqueue timestamp must be a non-negative safe integer");
    }
    if (draft.operation.localName.length === 0) {
        reject("the operation local name is empty");
    }
    if (!/^[0-9a-f]{64}$/.test(draft.operationVersion)) {
        reject("the pinned operation version is not a canonical digest");
    }
    if (draft.target.type === "entity" && !isEntityId(draft.target.entityId)) {
        reject("the queued target is not a sealed entity handle");
    }
    if (draft.target.type === "client-ref" && !isClientRef(draft.target.clientRef)) {
        reject("the queued target is not a durable client ref");
    }
    if (draft.target.type === "client-ref") {
        const targeted = draft.target.clientRef;
        if (draft.allocations.some((allocation) => allocation.clientRef === targeted)) {
            reject("an invocation may not target a client ref it allocates");
        }
    }
    const input = jsonSnapshot(draft.input, "input", new Set(), true);
    const slots = new Set();
    const allocated = new Set();
    for (const allocation of draft.allocations) {
        if (!isAllocationSlotName(allocation.slot)) {
            reject(`allocation slot ${JSON.stringify(allocation.slot)} is not a slot name`);
        }
        if (!isClientRef(allocation.clientRef)) {
            reject(`allocation slot ${allocation.slot} has no durable client ref`);
        }
        if (slots.has(allocation.slot))
            reject(`allocation slot ${allocation.slot} is declared twice`);
        if (allocated.has(allocation.clientRef)) {
            reject(`allocation slot ${allocation.slot} reuses another slot's client ref`);
        }
        slots.add(allocation.slot);
        allocated.add(allocation.clientRef);
    }
    const positions = new Set();
    for (const use of draft.inputRefs) {
        if (allocated.has(use.ref)) {
            reject("an invocation may not depend on a client ref it allocates");
        }
        const position = JSON.stringify(use.path);
        if (!validPath(use.path)) {
            reject(`input position ${position} is not an addressable path`);
        }
        if (positions.has(position))
            reject(`input position ${position} is declared twice`);
        positions.add(position);
        if (!isClientRef(use.ref) && !isEntityId(use.ref)) {
            reject(`input position ${position} is neither a client ref nor a sealed handle`);
        }
        if (readPath(input, use.path) !== use.ref) {
            reject(`input position ${position} does not hold the declared reference`);
        }
    }
    const embedded = embeddedSealingEpoch(draft.target, draft.inputRefs);
    if (embedded === "unreadable")
        reject("a sealed handle has no readable envelope");
    if (embedded === "mixed")
        reject("one invocation mixes two server sealing epochs");
    const sealing = embedded;
    const record = Object.freeze({
        partition,
        sequence,
        invocation: draft.invocation,
        scope: scopeKey,
        receiver,
        operation: Object.freeze({
            catalog: draft.operation.catalog,
            owner: Object.freeze({ ...draft.operation.owner }),
            localName: draft.operation.localName,
        }),
        operationVersion: draft.operationVersion,
        target: Object.freeze({ ...draft.target }),
        input,
        allocations: Object.freeze(draft.allocations.map((allocation) => Object.freeze({ ...allocation }))),
        inputRefs: Object.freeze(draft.inputRefs.map((use) => Object.freeze({ path: Object.freeze([...use.path]), ref: use.ref }))),
        sealing,
        enqueuedAt: draft.enqueuedAt,
    });
    return durable(record, decodeOutboxRecord, "outbox");
};
const intentMaterial = (record) => ({
    partition: record.partition,
    sequence: record.sequence,
    invocation: record.invocation,
    scope: record.scope,
    receiver: { ...record.receiver },
    operation: {
        catalog: record.operation.catalog,
        owner: { ...record.operation.owner },
        localName: record.operation.localName,
    },
    operationVersion: record.operationVersion,
    target: { ...record.target },
    input: record.input,
    allocations: record.allocations.map((allocation) => ({ ...allocation })),
    inputRefs: record.inputRefs.map((use) => ({ path: [...use.path], ref: use.ref })),
    sealing: record.sealing === null ? null : { ...record.sealing },
});
export const sameOutboxIntent = (left, right) => canonicalizeJson(intentMaterial(left)) === canonicalizeJson(intentMaterial(right));
export const outboxDependencies = (record) => {
    const refs = [];
    const seen = new Set();
    const add = (ref) => {
        if (seen.has(ref))
            return;
        seen.add(ref);
        refs.push(ref);
    };
    if (record.target.type === "client-ref")
        add(record.target.clientRef);
    for (const use of record.inputRefs)
        if (isClientRef(use.ref))
            add(use.ref);
    return Object.freeze(refs);
};
export const mappingKey = (partition, ref) => `${partition}\u0000${ref}`;
export const decideQuarantine = (epoch, keyId) => {
    if (epoch.codecVersion !== ENTITY_ID_CODEC)
        return "codec-version";
    if (keyId === undefined)
        return undefined;
    return decideServerIdentityBinding(epoch.keyId, keyId).type === "incompatible"
        ? "key-epoch"
        : undefined;
};
export const decideOutboxEntry = (record, context) => {
    if (record.sealing !== null) {
        const reason = decideQuarantine(record.sealing, context.keyId);
        if (reason !== undefined) {
            return Object.freeze({ type: "update-required", reason });
        }
    }
    const missing = [];
    for (const ref of outboxDependencies(record)) {
        const epoch = context.mapped.get(mappingKey(record.partition, ref));
        if (epoch === undefined) {
            missing.push(ref);
            continue;
        }
        const reason = decideQuarantine(epoch, context.keyId);
        if (reason !== undefined) {
            return Object.freeze({ type: "update-required", reason });
        }
    }
    if (missing.length > 0) {
        return Object.freeze({ type: "blocked", missing: Object.freeze(missing) });
    }
    return READY;
};
const READY = Object.freeze({ type: "ready" });
const EMPTY_HEAD = Object.freeze({ type: "empty" });
const headOf = (entry, unreadableAt) => {
    if (unreadableAt !== undefined &&
        (entry === undefined || unreadableAt < entry.record.sequence)) {
        return Object.freeze({ type: "unreadable", sequence: unreadableAt });
    }
    if (entry === undefined)
        return EMPTY_HEAD;
    switch (entry.state.type) {
        case "ready":
            return Object.freeze({ type: "ready", record: entry.record });
        case "blocked":
            return Object.freeze({
                type: "blocked",
                record: entry.record,
                missing: entry.state.missing,
            });
        case "update-required":
            return Object.freeze({
                type: "update-required",
                record: entry.record,
                reason: entry.state.reason,
            });
    }
};
export const planOutbox = (records, unreadable, context) => {
    const grouped = new Map();
    const bucketFor = (partition) => {
        const existing = grouped.get(partition);
        if (existing !== undefined)
            return existing;
        const created = { records: [], unreadable: [] };
        grouped.set(partition, created);
        return created;
    };
    for (const record of records)
        bucketFor(record.partition).records.push(record);
    for (const row of unreadable)
        bucketFor(row.partition).unreadable.push(row);
    return Object.freeze([...grouped.entries()]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .flatMap(([partition, bucket]) => {
        const receiver = bucket.records[0]?.receiver ??
            parseMutationPartitionKey(partition);
        if (receiver === undefined)
            return [];
        const ordered = [...bucket.records].sort((left, right) => left.sequence - right.sequence);
        const broken = [...bucket.unreadable].sort((left, right) => left.sequence - right.sequence);
        const entries = ordered.map((record) => Object.freeze({ record, state: decideOutboxEntry(record, context) }));
        return [Object.freeze({
                partition,
                receiver,
                entries: Object.freeze(entries),
                unreadable: Object.freeze(broken),
                head: headOf(entries[0], broken[0]?.sequence),
            })];
    }));
};
const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const decodeSealing = (value) => {
    if (value === null)
        return null;
    if (!isPlainObject(value))
        return undefined;
    if (!isCodecVersion(value.codecVersion))
        return undefined;
    if (typeof value.keyId !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(value.keyId)) {
        return undefined;
    }
    return Object.freeze({ codecVersion: value.codecVersion, keyId: value.keyId });
};
const decodeTarget = (value) => {
    if (!isPlainObject(value))
        return undefined;
    if (value.type === "none")
        return Object.freeze({ type: "none" });
    if (value.type === "entity" && isEntityId(value.entityId)) {
        return Object.freeze({ type: "entity", entityId: value.entityId });
    }
    if (value.type === "client-ref" && isClientRef(value.clientRef)) {
        return Object.freeze({ type: "client-ref", clientRef: value.clientRef });
    }
    return undefined;
};
const decodePath = (value) => {
    if (!Array.isArray(value))
        return undefined;
    if (!value.every(validPathSegment))
        return undefined;
    return Object.freeze([...value]);
};
export const decodeOutboxRecord = (value) => {
    if (!isPlainObject(value))
        return undefined;
    if (typeof value.partition !== "string" || !value.partition.startsWith(`${PARTITION_DOMAIN}:`)) {
        return undefined;
    }
    if (!isSequence(value.sequence))
        return undefined;
    if (!isInvocationId(value.invocation))
        return undefined;
    if (!isScopeKey(value.scope))
        return undefined;
    if (!isPlainObject(value.receiver) || typeof value.receiver.server !== "string" ||
        typeof value.receiver.principal !== "string" || typeof value.receiver.database !== "string")
        return undefined;
    const receiver = {
        server: value.receiver.server,
        principal: value.receiver.principal,
        database: value.receiver.database,
    };
    if (mutationPartitionKey(receiver) !== value.partition)
        return undefined;
    if (!isPlainObject(value.operation) || typeof value.operation.catalog !== "string" ||
        typeof value.operation.localName !== "string" || value.operation.localName.length === 0 ||
        !isPlainObject(value.operation.owner) ||
        (value.operation.owner.kind !== "entity" && value.operation.owner.kind !== "trait") ||
        typeof value.operation.owner.name !== "string")
        return undefined;
    if (typeof value.operationVersion !== "string" || !/^[0-9a-f]{64}$/.test(value.operationVersion)) {
        return undefined;
    }
    const target = decodeTarget(value.target);
    if (target === undefined)
        return undefined;
    const sealing = decodeSealing(value.sealing);
    if (sealing === undefined)
        return undefined;
    if (!isTimestamp(value.enqueuedAt))
        return undefined;
    if (!Array.isArray(value.allocations) || !Array.isArray(value.inputRefs))
        return undefined;
    const allocations = [];
    const slots = new Set();
    const claimed = new Set();
    for (const allocation of value.allocations) {
        if (!isPlainObject(allocation) || !isAllocationSlotName(allocation.slot) ||
            !isClientRef(allocation.clientRef))
            return undefined;
        if (slots.has(allocation.slot) || claimed.has(allocation.clientRef))
            return undefined;
        slots.add(allocation.slot);
        claimed.add(allocation.clientRef);
        allocations.push(Object.freeze({ slot: allocation.slot, clientRef: allocation.clientRef }));
    }
    const inputRefs = [];
    for (const use of value.inputRefs) {
        if (!isPlainObject(use))
            return undefined;
        const path = decodePath(use.path);
        if (path === undefined)
            return undefined;
        if (!isClientRef(use.ref) && !isEntityId(use.ref))
            return undefined;
        inputRefs.push(Object.freeze({ path, ref: use.ref }));
    }
    let input;
    try {
        input = jsonSnapshot(value.input, "input", new Set(), true);
    }
    catch {
        return undefined;
    }
    if (!inputRefsAgree(input, inputRefs))
        return undefined;
    if ((target.type === "client-ref" && claimed.has(target.clientRef)) ||
        inputRefs.some((use) => claimed.has(use.ref)))
        return undefined;
    const embedded = embeddedSealingEpoch(target, inputRefs);
    if (embedded === "unreadable" || embedded === "mixed")
        return undefined;
    if (embedded === null) {
        if (sealing !== null)
            return undefined;
    }
    else if (sealing === null || !sameSealingEpoch(sealing, embedded)) {
        return undefined;
    }
    return Object.freeze({
        partition: value.partition,
        sequence: value.sequence,
        invocation: value.invocation,
        scope: value.scope,
        receiver: Object.freeze(receiver),
        operation: Object.freeze({
            catalog: value.operation.catalog,
            owner: Object.freeze({
                kind: value.operation.owner.kind,
                name: value.operation.owner.name,
            }),
            localName: value.operation.localName,
        }),
        operationVersion: value.operationVersion,
        target,
        input,
        allocations: Object.freeze(allocations),
        inputRefs: Object.freeze(inputRefs),
        sealing,
        enqueuedAt: value.enqueuedAt,
    });
};
export const decodeClientRefMapping = (value) => {
    if (!isPlainObject(value))
        return undefined;
    if (typeof value.partition !== "string" ||
        parseMutationPartitionKey(value.partition) === undefined)
        return undefined;
    if (!isClientRef(value.clientRef) || !isEntityId(value.entityId))
        return undefined;
    if (!isInvocationId(value.invocation))
        return undefined;
    if (!isTimestamp(value.mappedAt))
        return undefined;
    const sealing = decodeSealing(value.sealing);
    if (sealing === undefined || sealing === null)
        return undefined;
    const embedded = sealingEpochOf(value.entityId);
    if (embedded === undefined || !sameSealingEpoch(sealing, embedded))
        return undefined;
    return Object.freeze({
        partition: value.partition,
        clientRef: value.clientRef,
        entityId: value.entityId,
        sealing: embedded,
        invocation: value.invocation,
        mappedAt: value.mappedAt,
    });
};
const durable = (record, decode, kind) => {
    let stored;
    try {
        stored = structuredClone(record);
    }
    catch {
        return reject(`a ${kind} record cannot be stored by structured clone`);
    }
    const decoded = decode(stored);
    if (decoded === undefined) {
        reject(`a ${kind} record does not survive its own durable decoder`);
    }
    return decoded;
};
const decodeReceiverScope = (value) => {
    if (!isPlainObject(value) || typeof value.server !== "string" ||
        typeof value.principal !== "string" || typeof value.database !== "string")
        return undefined;
    return Object.freeze({
        server: value.server,
        principal: value.principal,
        database: value.database,
    });
};
const isScopeKey = (value) => typeof value === "string" && value.length > 0;
const isTimestamp = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isSequence = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
const decodeActivation = (value) => {
    if (value === undefined)
        return 0;
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
        ? value
        : undefined;
};
const isCodecVersion = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 &&
    value <= 255;
export const buildQueueCursor = (record) => {
    const receiver = Object.freeze({
        server: record.receiver.server,
        principal: record.receiver.principal,
        database: record.receiver.database,
    });
    if (parseMutationPartitionKey(mutationPartitionKey(receiver)) === undefined) {
        reject("the receiver database does not form a reversible partition key");
    }
    return durable(Object.freeze({
        partition: record.partition,
        scope: record.scope,
        receiver,
        nextSequence: record.nextSequence,
        sealing: record.sealing === null ? null : Object.freeze({ ...record.sealing }),
        activation: record.activation,
        updatedAt: record.updatedAt,
    }), decodeQueueCursor, "queue cursor");
};
export const decodeQueueCursor = (value) => {
    if (!isPlainObject(value))
        return undefined;
    const receiver = decodeReceiverScope(value.receiver);
    if (receiver === undefined || typeof value.partition !== "string" ||
        mutationPartitionKey(receiver) !== value.partition)
        return undefined;
    if (!isScopeKey(value.scope))
        return undefined;
    if (!isSequence(value.nextSequence))
        return undefined;
    const sealing = decodeSealing(value.sealing);
    if (sealing === undefined)
        return undefined;
    const activation = decodeActivation(value.activation);
    if (activation === undefined)
        return undefined;
    if (!isTimestamp(value.updatedAt))
        return undefined;
    return Object.freeze({
        partition: value.partition,
        scope: value.scope,
        receiver,
        nextSequence: value.nextSequence,
        sealing,
        activation,
        updatedAt: value.updatedAt,
    });
};
export const buildReceipt = (record) => durable(Object.freeze({
    partition: record.partition,
    invocation: record.invocation,
    scope: record.scope,
    state: record.state,
    observation: record.observation,
    activation: record.activation,
    output: record.output,
    mappings: Object.freeze(record.mappings.map((mapping) => Object.freeze({ ...mapping }))),
    failure: record.failure === null ? null : Object.freeze({ ...record.failure }),
    updatedAt: record.updatedAt,
}), decodeReceipt, "receipt");
export const decodeReceipt = (value) => {
    if (!isPlainObject(value))
        return undefined;
    if (typeof value.partition !== "string" ||
        parseMutationPartitionKey(value.partition) === undefined)
        return undefined;
    if (!isInvocationId(value.invocation) || !isScopeKey(value.scope))
        return undefined;
    if (value.state !== "queued" && value.state !== "committed" && value.state !== "rejected")
        return undefined;
    if (value.observation !== null && value.observation !== "unobserved" &&
        value.observation !== "observed")
        return undefined;
    const activation = decodeActivation(value.activation);
    if (activation === undefined)
        return undefined;
    if (value.observation === null && activation !== 0)
        return undefined;
    if (!Array.isArray(value.mappings))
        return undefined;
    const mappings = [];
    const mapped = new Set();
    for (const mapping of value.mappings) {
        if (!isPlainObject(mapping) || !isClientRef(mapping.clientRef) ||
            !isEntityId(mapping.entityId) || mapped.has(mapping.clientRef))
            return undefined;
        mapped.add(mapping.clientRef);
        mappings.push(Object.freeze({ clientRef: mapping.clientRef, entityId: mapping.entityId }));
    }
    if (value.failure !== null &&
        (!isPlainObject(value.failure) || typeof value.failure.code !== "string"))
        return undefined;
    if (!isTimestamp(value.updatedAt))
        return undefined;
    let output = null;
    if (value.output !== null) {
        try {
            output = jsonSnapshot(value.output, "output", new Set(), false);
        }
        catch {
            return undefined;
        }
    }
    return Object.freeze({
        partition: value.partition,
        invocation: value.invocation,
        scope: value.scope,
        state: value.state,
        observation: value.observation,
        activation,
        output,
        mappings: Object.freeze(mappings),
        failure: value.failure === null
            ? null
            : Object.freeze({ code: value.failure.code }),
        updatedAt: value.updatedAt,
    });
};
export const buildClientRef = (record) => durable(Object.freeze({
    partition: record.partition,
    clientRef: record.clientRef,
    invocation: record.invocation,
    slot: record.slot,
    createdAt: record.createdAt,
}), decodeClientRef, "client ref");
export const decodeClientRef = (value) => {
    if (!isPlainObject(value))
        return undefined;
    if (typeof value.partition !== "string" ||
        parseMutationPartitionKey(value.partition) === undefined)
        return undefined;
    if (!isClientRef(value.clientRef) || !isInvocationId(value.invocation)) {
        return undefined;
    }
    if (!isAllocationSlotName(value.slot) || !isTimestamp(value.createdAt)) {
        return undefined;
    }
    return Object.freeze({
        partition: value.partition,
        clientRef: value.clientRef,
        invocation: value.invocation,
        slot: value.slot,
        createdAt: value.createdAt,
    });
};
export const buildClientRefMapping = (record) => durable(Object.freeze({
    partition: record.partition,
    clientRef: record.clientRef,
    entityId: record.entityId,
    sealing: Object.freeze({ ...record.sealing }),
    invocation: record.invocation,
    mappedAt: record.mappedAt,
}), decodeClientRefMapping, "client ref mapping");
//# sourceMappingURL=outbox.js.map