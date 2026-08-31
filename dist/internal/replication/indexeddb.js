import * as Result from "effect/Result";
import { ALL_INDEXES } from "../core/datom.js";
import { buildRoots } from "../core/conn.js";
import { sha256Hex } from "../core/bytes.js";
import { Db, rootFor } from "../core/db.js";
import { Novelty } from "../core/novelty.js";
import { FIRST_USER_EID, Schema } from "../core/schema.js";
import { deserializeNode, gzipCodec, serializeNode } from "../core/store.js";
import { decodeNode, NodeKind, } from "../core/tree.js";
import { inertRuntimeBoundaries, } from "../runtime-boundaries.js";
import { REPLICA_STORAGE_VERSION, } from "./protocol.js";
import { replicaAttributeDatoms, replicaAttributes, replicaBootstrapDatoms, replicaFactDatom, sameReplicaAttributes, } from "./replica-schema.js";
import { abortTransaction, abortWithSignal, commitTransaction, compoundPrefixRange, prefixRange, requestResult, transactionDone, } from "./idb.js";
import { clearMutationScope, createMutationStores, IndexedDbOutbox, MUTATION_STORE_FAMILIES, } from "./outbox-storage.js";
import { classifyReplicaStorageFailure, replicaQuotaRecovery, replicaSweepKey, replicaSweepPrefix, ReplicaQuotaExhaustedError, ReplicaReachability, stagingIsSweepable, unreachableNodeHashes, } from "./replica-gc.js";
import { identityNotice, platformBroadcast, replicaNotice, replicaNoticeChannelName, ReplicaNoticeChannel, } from "./notices.js";
import { identityInDatabase, identityInScope, REPLICA_CLEAR_BARRIER_KEY, REPLICA_COMMITTED_HEADS_STORE, REPLICA_GENERATIONS_STORE, replicaDatabaseKey, replicaDatabasePartitionPrefix, replicaDatabaseScopeOf, replicaPartitionKey, replicaPartitionScopeKey, replicaScopeKey, replicaScopeOf, replicaScopePartitionPrefix, withConfirmedScope, withoutConfirmedScope, ReplicaDatabaseActiveError, ReplicaFencedError, ReplicaLease, ReplicaScopeClearedError, ReplicaScopeUnconfirmedError, } from "./replica-lifecycle.js";
import { digestReplicaDatoms, emptyReplicaIndexDigest, expectedReplicaContents, replicaAbsent, replicaContended, replicaManifestFingerprint, replicaManifestIdentity, replicaRestored, replicaUnusable, restoredReplica, validateReplicaContents, validateReplicaManifest, validateReplicaNode, } from "./replica-integrity.js";
import { applyReplicationFrame, emptyClientReplicationState, ReplicationTransitionError, sameReplicationIdentity, } from "./state.js";
const STORAGE_V2_DATABASE_VERSION = 5;
const LIFECYCLE_DATABASE_VERSION = 6;
const MUTATION_INDEX_DATABASE_VERSION = 9;
const OPTIMISTIC_LAYER_DATABASE_VERSION = 10;
export const REPLICA_MANIFEST_STORAGE_VERSION = OPTIMISTIC_LAYER_DATABASE_VERSION + 1;
const MANIFEST_V3_DATABASE_VERSION = REPLICA_MANIFEST_STORAGE_VERSION;
const GRAPH_RECEIVER_DATABASE_VERSION = MANIFEST_V3_DATABASE_VERSION + 1;
export const REPLICA_DATABASE_VERSION = GRAPH_RECEIVER_DATABASE_VERSION;
const DATABASE_VERSION = REPLICA_DATABASE_VERSION;
const COMMITTED = "replica-committed-v1";
const COMMITTED_HEADS = REPLICA_COMMITTED_HEADS_STORE;
const STAGING = "replica-staging-v1";
const STAGING_CHUNKS = "replica-staging-chunks-v1";
const NODES = "replica-nodes-v1";
const CREDENTIAL_BINDINGS = "replica-credential-bindings-v1";
const CACHE_CANDIDATES = "replica-cache-candidates-v1";
const ROUTE_SLOTS = "replica-route-slots-v1";
const GRAPH_RECEIVERS = "replica-graph-receivers-v1";
const GENERATIONS = REPLICA_GENERATIONS_STORE;
const USER_T = 2;
const REPLICA_STORE_FAMILIES = [
    COMMITTED,
    COMMITTED_HEADS,
    STAGING,
    STAGING_CHUNKS,
    NODES,
    CREDENTIAL_BINDINGS,
    CACHE_CANDIDATES,
    ROUTE_SLOTS,
    GRAPH_RECEIVERS,
    GENERATIONS,
];
const REPLICA_VALUE_FAMILIES = REPLICA_STORE_FAMILIES.filter((family) => family !== GENERATIONS);
const STORAGE_V2_SWEEP_PREFIX = "ramose-replica-sweep-v2:";
const PARTITION_KEYED_FAMILIES = [COMMITTED, COMMITTED_HEADS, STAGING];
const PARTITION_PREFIXED_FAMILIES = [STAGING_CHUNKS, NODES];
const IDENTITY_KEYED_FAMILIES = [CREDENTIAL_BINDINGS, CACHE_CANDIDATES];
export const DEFAULT_REPLICA_DATABASE_NAME = "ramose-replicas";
export { replicaPartitionKey } from "./replica-lifecycle.js";
export { ReplicaQuotaExhaustedError, replicaSweepKey, } from "./replica-gc.js";
export const REPLICA_GRAPH_RECEIVER_VERSION = 1;
class WriteMeter {
    nodes = 0;
    manifests = 0;
    heads = 0;
    staging = 0;
    stagingChunks = 0;
    counts() {
        return Object.freeze({
            nodes: this.nodes,
            manifests: this.manifests,
            heads: this.heads,
            staging: this.staging,
            stagingChunks: this.stagingChunks,
        });
    }
    reset() {
        this.nodes = 0;
        this.manifests = 0;
        this.heads = 0;
        this.staging = 0;
        this.stagingChunks = 0;
    }
}
const committedHead = (record) => ({
    partition: record.partition,
    storageVersion: record.storageVersion,
    identity: record.identity,
    readCompatibilityHash: record.readCompatibilityHash,
    revision: record.revision,
});
const LIFECYCLE_REGISTRIES = new Map();
const confirmationRecords = (identity, confirmedAt) => {
    const scope = replicaScopeKey(replicaScopeOf(identity));
    return [
        { key: scope, kind: "scope", scope, generation: 1, confirmedAt, fencedAt: null },
        {
            key: replicaDatabaseKey(replicaDatabaseScopeOf(identity)),
            kind: "database",
            scope,
            generation: 1,
            confirmedAt,
            fencedAt: null,
        },
    ];
};
const seedConfirmedGenerations = (upgrade) => {
    const generations = upgrade.objectStore(GENERATIONS);
    const confirmedAt = Date.now();
    const scopes = new Set();
    for (const family of [COMMITTED, ...IDENTITY_KEYED_FAMILIES]) {
        const request = upgrade.objectStore(family).getAll();
        request.addEventListener("success", () => {
            const records = request.result;
            for (const record of records) {
                scopes.add(replicaScopeKey(replicaScopeOf(record.identity)));
                for (const seeded of confirmationRecords(record.identity, confirmedAt)) {
                    generations.put(seeded);
                }
            }
        }, { once: true });
    }
    const routes = upgrade.objectStore(ROUTE_SLOTS);
    const observed = routes.getAll();
    observed.addEventListener("success", () => {
        const owners = [...scopes].sort();
        for (const record of observed.result) {
            if (record.replicaScopes !== undefined)
                continue;
            if (owners.length === 0)
                routes.delete([record.scope, record.pathKey]);
            else
                routes.put({ ...record, replicaScopes: owners });
        }
    }, { once: true });
};
const lifecycleRegistry = (name) => {
    const existing = LIFECYCLE_REGISTRIES.get(name);
    if (existing !== undefined)
        return existing;
    const created = {
        pins: new Map(),
        participants: new Set(),
        retained: new Map(),
        materializing: new Map(),
    };
    LIFECYCLE_REGISTRIES.set(name, created);
    return created;
};
const chunkRange = (partition) => IDBKeyRange.bound([partition, 0], [partition, Number.MAX_SAFE_INTEGER]);
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const transition = (state, frame) => {
    const result = applyReplicationFrame(state, frame);
    if (Result.isFailure(result))
        throw result.failure;
    return result.success;
};
const rootHashes = (roots) => ALL_INDEXES.map((index) => rootFor(roots, index).hash);
const replicaFence = (lease, identity) => lease === undefined ? undefined : {
    lease,
    scopeKey: replicaScopeKey(replicaScopeOf(identity)),
    databaseKey: replicaDatabaseKey(replicaDatabaseScopeOf(identity)),
};
const enforceFence = async (transaction, fence) => {
    if (fence === undefined)
        return;
    const generations = transaction.objectStore(GENERATIONS);
    const [scope, database] = await Promise.all([
        requestResult(generations.get(fence.scopeKey)),
        requestResult(generations.get(fence.databaseKey)),
    ]);
    try {
        fence.lease.observe(fence.scopeKey, scope?.generation ?? 0);
        fence.lease.observe(fence.databaseKey, database?.generation ?? 0);
        fence.lease.admit(fence.scopeKey, scope?.clearedAt ?? 0);
    }
    catch (error) {
        await abortTransaction(transaction);
        throw error;
    }
};
class IndexedDbNodeStore {
    database;
    partition;
    signal;
    fence;
    meter;
    constructor(database, partition, signal, fence, meter) {
        this.database = database;
        this.partition = partition;
        this.signal = signal;
        this.fence = fence;
        this.meter = meter;
    }
    peek(_hash) {
        return undefined;
    }
    async load(ref) {
        this.signal?.throwIfAborted();
        const transaction = this.database.transaction(NODES, "readonly");
        const record = await requestResult(transaction.objectStore(NODES).get([this.partition, ref.hash]));
        await transactionDone(transaction);
        if (record === undefined)
            throw new Error(`missing replica node ${ref.hash}`);
        return deserializeNode(record.body, gzipCodec);
    }
    async put(index, node) {
        this.signal?.throwIfAborted();
        const { ref, body } = await serializeNode(index, node, gzipCodec);
        this.signal?.throwIfAborted();
        const transaction = this.database.transaction(this.fence === undefined ? [NODES] : [NODES, GENERATIONS], "readwrite");
        await enforceFence(transaction, this.fence);
        transaction.objectStore(NODES).put({
            partition: this.partition,
            hash: ref.hash,
            body,
        });
        await commitTransaction(transaction);
        if (this.meter !== undefined)
            this.meter.nodes++;
        return ref;
    }
}
const newInstallId = () => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let hex = "";
    for (const byte of bytes)
        hex += byte.toString(16).padStart(2, "0");
    return hex;
};
const materialize = async (database, identity, committed, attributes, prior, signal, fence, meter) => {
    signal?.throwIfAborted();
    const partition = replicaPartitionKey(identity);
    const specs = replicaAttributes(attributes);
    if (prior !== undefined && !sameReplicaAttributes(prior.attributes, specs)) {
        throw new Error("replica attribute metadata changed within one committed read view");
    }
    const attributeIds = new Map(prior?.attributeIds ?? []);
    const entities = new Map(prior?.entityIds ?? []);
    let nextLocalId = prior?.nextLocalId ?? FIRST_USER_EID;
    const schemaDatoms = [];
    const bootstrap = Schema.bootstrap();
    for (const spec of specs) {
        const builtIn = bootstrap.attr(spec.ident);
        let id = builtIn?.id ?? attributeIds.get(spec.ident);
        if (id === undefined) {
            id = nextLocalId++;
            attributeIds.set(spec.ident, id);
        }
        if (builtIn === undefined)
            schemaDatoms.push(...replicaAttributeDatoms(id, spec, USER_T));
    }
    const logicalEntities = new Set();
    for (const datom of committed.datoms) {
        logicalEntities.add(datom.entity);
        if (datom.value.type === "ref")
            logicalEntities.add(datom.value.value);
    }
    for (const entity of [...logicalEntities].sort()) {
        if (!entities.has(entity))
            entities.set(entity, nextLocalId++);
    }
    const facts = [];
    const schema = bootstrap.clone().apply(schemaDatoms);
    for (const logical of committed.datoms) {
        const fact = replicaFactDatom(logical, schema, entities);
        if (typeof fact === "string") {
            throw new Error(fact === "value-type"
                ? `logical value type disagrees with ${logical.field}`
                : `logical fact references unknown field ${logical.field}`);
        }
        facts.push(fact);
    }
    const store = new IndexedDbNodeStore(database, partition, signal, fence, meter);
    const roots = await buildRoots(store, schema, replicaBootstrapDatoms().concat(schemaDatoms, facts));
    signal?.throwIfAborted();
    const record = {
        partition,
        storageVersion: REPLICA_STORAGE_VERSION,
        identity,
        readCompatibilityHash: identity.readCompatibilityHash,
        revision: committed.revision,
        datoms: Object.freeze([...committed.datoms]),
        attributes: Object.freeze(specs),
        entityIds: Object.freeze([...entities]),
        entityHandles: Object.freeze([...entities.keys()].flatMap((entity) => {
            const handle = committed.handles.get(entity);
            return handle === undefined
                ? []
                : [Object.freeze([entity, handle])];
        })),
        attributeIds: Object.freeze([...attributeIds]),
        roots,
        nextLocalId,
        installId: newInstallId(),
    };
    return {
        record,
        db: new Db({
            store: new IndexedDbNodeStore(database, partition),
            roots,
            novelty: new Novelty(),
            basisT: roots.t,
            schema,
            nextEid: nextLocalId,
        }),
    };
};
const recordHandles = (record) => {
    const entities = new Map(record.entityIds);
    const handles = new Map();
    for (const [identity, handle] of record.entityHandles) {
        const eid = entities.get(identity);
        if (eid !== undefined)
            handles.set(handle, eid);
    }
    return handles;
};
const dbFromRecord = (database, record, expected) => {
    if (record.readCompatibilityHash !== expected ||
        record.identity.readCompatibilityHash !== expected) {
        throw new Error("replica read compatibility is not confirmed for this client");
    }
    const schemaDatoms = [];
    const bootstrap = Schema.bootstrap();
    const attributeIds = new Map(record.attributeIds);
    for (const spec of record.attributes) {
        const builtIn = bootstrap.attr(spec.ident);
        const id = builtIn?.id ?? attributeIds.get(spec.ident);
        if (id === undefined)
            throw new Error(`missing local attribute id for ${spec.ident}`);
        if (builtIn === undefined)
            schemaDatoms.push(...replicaAttributeDatoms(id, spec, USER_T));
    }
    const schema = bootstrap.clone().apply(schemaDatoms);
    return new Db({
        store: new IndexedDbNodeStore(database, record.partition),
        roots: record.roots,
        novelty: new Novelty(),
        basisT: record.roots.t,
        schema,
        nextEid: record.nextLocalId,
    });
};
const VALIDATION_BATCH = 32;
const readNodeRecords = async (database, partition, hashes) => {
    const transaction = database.transaction(NODES, "readonly");
    const store = transaction.objectStore(NODES);
    const pending = hashes.map((hash) => requestResult(store.get([partition, hash])));
    const records = await Promise.all(pending);
    await transactionDone(transaction);
    return records;
};
const verifyNodeRecord = async (index, ref, record, expectedKey) => {
    const located = { index, hash: ref.hash };
    if (record === undefined) {
        return { reason: "node-missing", detail: "referenced node is not stored", ...located };
    }
    if (!(record.body instanceof Uint8Array)) {
        return { reason: "node-undecodable", detail: "node record carries no body", ...located };
    }
    if (await sha256Hex(record.body) !== ref.hash) {
        return { reason: "node-hash", detail: "node body does not hash to its address", ...located };
    }
    let decoded;
    try {
        decoded = decodeNode(await gzipCodec.decompress(record.body));
    }
    catch {
        return { reason: "node-undecodable", detail: "node body cannot be decoded", ...located };
    }
    return validateReplicaNode(index, ref, decoded, expectedKey) ?? decoded;
};
const validateReachableNodes = async (database, manifest, reached) => {
    const seen = reached ?? new Set();
    const expected = expectedReplicaContents(manifest);
    if (Result.isFailure(expected))
        return expected.failure;
    const digests = {
        0: emptyReplicaIndexDigest(),
        1: emptyReplicaIndexDigest(),
        2: emptyReplicaIndexDigest(),
        3: emptyReplicaIndexDigest(),
    };
    for (const index of ALL_INDEXES) {
        const digest = digests[index];
        const frontier = [{ ref: rootFor(manifest.roots, index) }];
        while (frontier.length > 0) {
            const batch = [];
            while (batch.length < VALIDATION_BATCH && frontier.length > 0) {
                const pending = frontier.pop();
                if (seen.has(pending.ref.hash)) {
                    return {
                        reason: "node-invariant",
                        detail: "one node is linked from more than one place",
                        index,
                        hash: pending.ref.hash,
                    };
                }
                seen.add(pending.ref.hash);
                batch.push(pending);
            }
            const records = await readNodeRecords(database, manifest.partition, batch.map((pending) => pending.ref.hash));
            for (let i = 0; i < batch.length; i++) {
                const { ref, key } = batch[i];
                const node = await verifyNodeRecord(index, ref, records[i], key);
                if ("reason" in node)
                    return node;
                if (node.node.kind === NodeKind.Leaf)
                    digestReplicaDatoms(digest, node.node.datoms);
                else {
                    for (let child = 0; child < node.node.refs.length; child++) {
                        frontier.push({ ref: node.node.refs[child], key: node.node.keys[child] });
                    }
                }
            }
        }
    }
    return validateReplicaContents(manifest.roots, digests, expected.success);
};
const reachableFromRoots = async (database, partition, roots) => {
    const walk = new ReplicaReachability(roots);
    while (walk.pending) {
        const batch = walk.next(VALIDATION_BATCH);
        const records = await readNodeRecords(database, partition, batch);
        for (let i = 0; i < batch.length; i++) {
            const record = records[i];
            if (record === undefined || !(record.body instanceof Uint8Array)) {
                walk.fail();
                return walk;
            }
            if (await sha256Hex(record.body) !== batch[i]) {
                walk.fail();
                return walk;
            }
            try {
                const decoded = decodeNode(await gzipCodec.decompress(record.body));
                walk.expand(decoded.node.kind === NodeKind.Leaf
                    ? []
                    : decoded.node.refs.map((ref) => ref.hash));
            }
            catch {
                walk.fail();
                return walk;
            }
        }
    }
    return walk;
};
const storedReadCompatibilityHash = (record) => typeof record === "object" && record !== null &&
    typeof record
        .readCompatibilityHash === "string"
    ? record
        .readCompatibilityHash
    : undefined;
const storedRevision = (record) => typeof record === "object" && record !== null &&
    typeof record.revision === "string"
    ? record.revision
    : null;
let retentionToken = 0;
const RECORD_MOVED = Symbol("replica.record-moved");
const REPLICA_SWEEP_RESTORE_ATTEMPTS = 3;
export class IndexedDbReplicaStorage {
    name;
    database;
    boundaries;
    channel;
    clearedScopes = new Set();
    registry;
    registrations = new Set();
    invalidations = new Set();
    meter = new WriteMeter();
    constructor(name, database, boundaries, channel) {
        this.name = name;
        this.database = database;
        this.boundaries = boundaries;
        this.channel = channel;
        this.registry = lifecycleRegistry(name);
    }
    static async open(name = DEFAULT_REPLICA_DATABASE_NAME, boundaries = inertRuntimeBoundaries) {
        const request = indexedDB.open(name, DATABASE_VERSION);
        request.addEventListener("upgradeneeded", (event) => {
            const database = request.result;
            if (!database.objectStoreNames.contains(COMMITTED)) {
                database.createObjectStore(COMMITTED, { keyPath: "partition" });
            }
            if (!database.objectStoreNames.contains(COMMITTED_HEADS)) {
                database.createObjectStore(COMMITTED_HEADS, { keyPath: "partition" });
            }
            if (!database.objectStoreNames.contains(STAGING)) {
                database.createObjectStore(STAGING, { keyPath: "partition" });
            }
            if (!database.objectStoreNames.contains(STAGING_CHUNKS)) {
                database.createObjectStore(STAGING_CHUNKS, { keyPath: ["partition", "index"] });
            }
            if (!database.objectStoreNames.contains(NODES)) {
                database.createObjectStore(NODES, { keyPath: ["partition", "hash"] });
            }
            if (!database.objectStoreNames.contains(CREDENTIAL_BINDINGS)) {
                database.createObjectStore(CREDENTIAL_BINDINGS, { keyPath: "fingerprint" });
            }
            if (!database.objectStoreNames.contains(CACHE_CANDIDATES)) {
                database.createObjectStore(CACHE_CANDIDATES, {
                    keyPath: ["selector", "routeSlot"],
                });
            }
            if (!database.objectStoreNames.contains(ROUTE_SLOTS)) {
                database.createObjectStore(ROUTE_SLOTS, { keyPath: ["scope", "pathKey"] });
            }
            if (!database.objectStoreNames.contains(GRAPH_RECEIVERS)) {
                database.createObjectStore(GRAPH_RECEIVERS, { keyPath: "key" });
            }
            if (!database.objectStoreNames.contains(GENERATIONS)) {
                database.createObjectStore(GENERATIONS, { keyPath: "key" });
            }
            const oldVersion = event.oldVersion;
            if (request.transaction !== null) {
                createMutationStores(database, request.transaction, oldVersion > 0 && oldVersion < MUTATION_INDEX_DATABASE_VERSION);
            }
            if (oldVersion > 0 && oldVersion < STORAGE_V2_DATABASE_VERSION && request.transaction !== null) {
                const upgrade = request.transaction;
                for (const store of REPLICA_STORE_FAMILIES)
                    upgrade.objectStore(store).clear();
            }
            else if (oldVersion >= STORAGE_V2_DATABASE_VERSION &&
                oldVersion < LIFECYCLE_DATABASE_VERSION && request.transaction !== null) {
                seedConfirmedGenerations(request.transaction);
            }
            if (oldVersion > 0 && oldVersion < MANIFEST_V3_DATABASE_VERSION &&
                request.transaction !== null) {
                const upgrade = request.transaction;
                for (const store of REPLICA_VALUE_FAMILIES)
                    upgrade.objectStore(store).clear();
                upgrade.objectStore(GENERATIONS).delete(prefixRange(STORAGE_V2_SWEEP_PREFIX));
            }
        });
        const database = await requestResult(request);
        const storage = new IndexedDbReplicaStorage(name, database, boundaries, ReplicaNoticeChannel.begin({
            name: replicaNoticeChannelName(name),
            broadcast: platformBroadcast(),
        }));
        database.addEventListener("versionchange", () => {
            database.close();
            storage.invalidated();
        });
        return storage;
    }
    notices(listener) {
        return this.register(this.channel.subscribe(listener));
    }
    announces() {
        return this.channel.announces();
    }
    announce(notice) {
        this.channel.post(notice);
    }
    onInvalidated(listener) {
        this.invalidations.add(listener);
        return this.register(() => {
            this.invalidations.delete(listener);
        });
    }
    invalidated() {
        for (const listener of [...this.invalidations])
            listener();
    }
    close() {
        for (const release of [...this.registrations])
            release();
        this.channel.close();
        this.database.close();
    }
    writeCounts() {
        return this.meter.counts();
    }
    resetWriteCounts() {
        this.meter.reset();
    }
    register(release) {
        let released = false;
        const once = () => {
            if (released)
                return;
            released = true;
            this.registrations.delete(once);
            release();
        };
        this.registrations.add(once);
        return once;
    }
    outbox(leader) {
        return new IndexedDbOutbox(this.database, this.boundaries, (scope) => void this.assertScopeLive(scope), leader, (notice) => this.announce(notice));
    }
    async claimLeadership(key, scope) {
        const scopeKey = this.assertScopeLive(scope);
        const transaction = this.database.transaction(GENERATIONS, "readwrite");
        const store = transaction.objectStore(GENERATIONS);
        const held = await requestResult(store.get(key));
        const generation = (held?.generation ?? 0) + 1;
        store.put({
            key,
            kind: "leader",
            scope: scopeKey,
            generation,
            confirmedAt: Date.now(),
            fencedAt: null,
        });
        await commitTransaction(transaction);
        return generation;
    }
    async admission() {
        const transaction = this.database.transaction(GENERATIONS, "readonly");
        const record = await requestResult(transaction.objectStore(GENERATIONS).get(REPLICA_CLEAR_BARRIER_KEY));
        await transactionDone(transaction);
        return record?.generation ?? 0;
    }
    async lease() {
        return new ReplicaLease(await this.admission());
    }
    async confirmLease(lease, identity) {
        this.assertScopeLive(replicaScopeOf(identity));
        const transaction = this.database.transaction(GENERATIONS, "readonly");
        await enforceFence(transaction, replicaFence(lease, identity));
        await transactionDone(transaction);
    }
    async leaseFor(identity) {
        const lease = await this.lease();
        await this.confirmLease(lease, identity);
        return lease;
    }
    pinDatabase(scope) {
        const key = replicaDatabaseKey(scope);
        const pins = this.registry.pins;
        pins.set(key, (pins.get(key) ?? 0) + 1);
        return this.register(() => {
            const held = (pins.get(key) ?? 1) - 1;
            if (held > 0)
                pins.set(key, held);
            else
                pins.delete(key);
        });
    }
    retainRoots(identity, roots) {
        const partition = replicaPartitionKey(identity);
        const held = this.registry.retained;
        const entries = held.get(partition) ?? new Map();
        held.set(partition, entries);
        const token = ++retentionToken;
        entries.set(token, rootHashes(roots));
        return this.register(() => {
            entries.delete(token);
            if (entries.size === 0)
                held.delete(partition);
        });
    }
    markMaterializing(partition) {
        const marks = this.registry.materializing;
        marks.set(partition, (marks.get(partition) ?? 0) + 1);
        let released = false;
        return () => {
            if (released)
                return;
            released = true;
            const held = (marks.get(partition) ?? 1) - 1;
            if (held > 0)
                marks.set(partition, held);
            else
                marks.delete(partition);
        };
    }
    enroll(participant) {
        this.registry.participants.add(participant);
        return this.register(() => {
            this.registry.participants.delete(participant);
        });
    }
    assertScopeLive(scope) {
        const key = replicaScopeKey(scope);
        if (this.clearedScopes.has(key))
            throw new ReplicaScopeClearedError({ scope: key });
        return key;
    }
    async closeMatching(match) {
        for (const participant of [...this.registry.participants]) {
            if (!match(participant))
                continue;
            this.registry.participants.delete(participant);
            await participant.close();
        }
    }
    async clearScope(scope) {
        const scopeKey = this.assertScopeLive(scope);
        const prefix = replicaScopePartitionPrefix(scope);
        this.clearedScopes.add(scopeKey);
        const transaction = this.database.transaction([...REPLICA_STORE_FAMILIES, ...MUTATION_STORE_FAMILIES], "readwrite");
        let outcome;
        try {
            outcome = await this.stageClear(transaction, scope, scopeKey, prefix);
        }
        catch (error) {
            this.clearedScopes.delete(scopeKey);
            await abortTransaction(transaction);
            throw error;
        }
        await commitTransaction(transaction);
        this.announce(replicaNotice("reset", scope));
        await this.closeMatching((participant) => replicaScopeKey(participant.scope) === scopeKey);
        return outcome;
    }
    async stageClear(transaction, scope, scopeKey, prefix) {
        const generations = transaction.objectStore(GENERATIONS);
        const confirmed = await requestResult(generations.get(scopeKey));
        if (confirmed === undefined) {
            throw new ReplicaScopeUnconfirmedError({ scope: scopeKey });
        }
        const [partitions, nodes] = await Promise.all([
            requestResult(transaction.objectStore(COMMITTED).count(prefixRange(prefix))),
            requestResult(transaction.objectStore(NODES).count(compoundPrefixRange(prefix))),
        ]);
        for (const family of PARTITION_KEYED_FAMILIES) {
            transaction.objectStore(family).delete(prefixRange(prefix));
        }
        for (const family of PARTITION_PREFIXED_FAMILIES) {
            transaction.objectStore(family).delete(compoundPrefixRange(prefix));
        }
        generations.delete(prefixRange(replicaSweepPrefix(prefix)));
        const bindingStore = transaction.objectStore(CREDENTIAL_BINDINGS);
        const candidateStore = transaction.objectStore(CACHE_CANDIDATES);
        const routeStore = transaction.objectStore(ROUTE_SLOTS);
        const [bindingRecords, candidateRecords, routeRecords] = await Promise.all([
            requestResult(bindingStore.getAll()),
            requestResult(candidateStore.getAll()),
            requestResult(routeStore.getAll()),
        ]);
        let bindings = 0;
        for (const binding of bindingRecords) {
            if (!identityInScope(binding.identity, scope))
                continue;
            bindingStore.delete(binding.fingerprint);
            bindings++;
        }
        let candidates = 0;
        for (const candidate of candidateRecords) {
            if (!identityInScope(candidate.identity, scope))
                continue;
            candidateStore.delete([candidate.selector, candidate.routeSlot]);
            candidates++;
        }
        const receiverStore = transaction.objectStore(GRAPH_RECEIVERS);
        for (const receiver of await requestResult(receiverStore.getAll())) {
            if (receiver.scope === scopeKey)
                receiverStore.delete(receiver.key);
        }
        let routeObservations = 0;
        for (const observation of routeRecords) {
            if (!(observation.replicaScopes ?? []).includes(scopeKey))
                continue;
            routeObservations++;
            const remaining = withoutConfirmedScope(observation.replicaScopes, scopeKey);
            if (remaining.length === 0) {
                routeStore.delete([observation.scope, observation.pathKey]);
            }
            else {
                routeStore.put({ ...observation, replicaScopes: remaining });
            }
        }
        const mutations = await clearMutationScope(transaction, scope);
        const generation = confirmed.generation + 1;
        const clearedAt = await this.advanceBarrier(generations);
        generations.put({
            ...confirmed,
            generation,
            fencedAt: Date.now(),
            clearedAt,
        });
        await this.boundaries.checkpoint("replica.clear");
        return Object.freeze({
            scope: scopeKey,
            generation,
            partitions,
            nodes,
            bindings,
            candidates,
            routeObservations,
            queued: mutations.queued,
            clientRefs: mutations.clientRefs,
            layers: mutations.layers,
        });
    }
    async evictDatabase(scope) {
        const scopeKey = this.assertScopeLive(scope);
        const databaseKey = replicaDatabaseKey(scope);
        const pins = this.registry.pins.get(databaseKey) ?? 0;
        if (pins > 0)
            throw new ReplicaDatabaseActiveError({ database: databaseKey, pins });
        const prefix = replicaDatabasePartitionPrefix(scope);
        const transaction = this.database.transaction([
            ...PARTITION_KEYED_FAMILIES,
            ...PARTITION_PREFIXED_FAMILIES,
            ...IDENTITY_KEYED_FAMILIES,
            GENERATIONS,
        ], "readwrite");
        let outcome;
        try {
            outcome = await this.stageEviction(transaction, scope, scopeKey, databaseKey, prefix);
        }
        catch (error) {
            await abortTransaction(transaction);
            throw error;
        }
        await commitTransaction(transaction);
        this.announce(replicaNotice("reset", scope, scope));
        await this.closeMatching((participant) => participant.database !== undefined &&
            replicaDatabaseKey(participant.database) === databaseKey);
        return outcome;
    }
    async stageEviction(transaction, scope, scopeKey, databaseKey, prefix) {
        const generations = transaction.objectStore(GENERATIONS);
        const [confirmed, current] = await Promise.all([
            requestResult(generations.get(scopeKey)),
            requestResult(generations.get(databaseKey)),
        ]);
        if (confirmed === undefined) {
            throw new ReplicaScopeUnconfirmedError({ scope: scopeKey });
        }
        const [partitions, nodes] = await Promise.all([
            requestResult(transaction.objectStore(COMMITTED).count(prefixRange(prefix))),
            requestResult(transaction.objectStore(NODES).count(compoundPrefixRange(prefix))),
        ]);
        for (const family of PARTITION_KEYED_FAMILIES) {
            transaction.objectStore(family).delete(prefixRange(prefix));
        }
        for (const family of PARTITION_PREFIXED_FAMILIES) {
            transaction.objectStore(family).delete(compoundPrefixRange(prefix));
        }
        generations.delete(prefixRange(replicaSweepPrefix(prefix)));
        const bindingStore = transaction.objectStore(CREDENTIAL_BINDINGS);
        const candidateStore = transaction.objectStore(CACHE_CANDIDATES);
        const [bindingRecords, candidateRecords] = await Promise.all([
            requestResult(bindingStore.getAll()),
            requestResult(candidateStore.getAll()),
        ]);
        let bindings = 0;
        for (const binding of bindingRecords) {
            if (!identityInDatabase(binding.identity, scope))
                continue;
            bindingStore.delete(binding.fingerprint);
            bindings++;
        }
        let candidates = 0;
        for (const candidate of candidateRecords) {
            if (!identityInDatabase(candidate.identity, scope))
                continue;
            candidateStore.delete([candidate.selector, candidate.routeSlot]);
            candidates++;
        }
        const generation = (current?.generation ?? 0) + 1;
        generations.put({
            key: databaseKey,
            kind: "database",
            scope: scopeKey,
            generation,
            confirmedAt: current?.confirmedAt ?? Date.now(),
            fencedAt: Date.now(),
        });
        await this.boundaries.checkpoint("replica.evict");
        return Object.freeze({
            database: databaseKey,
            generation,
            partitions,
            nodes,
            bindings,
            candidates,
        });
    }
    async collectGarbage(options = {}) {
        let prefix;
        if (options.scope !== undefined) {
            this.assertScopeLive(options.scope);
            prefix = replicaScopePartitionPrefix(options.scope);
        }
        const survey = await this.surveyPartitions(prefix);
        let partitions = 0;
        let swept = 0;
        let skipped = 0;
        let nodes = 0;
        let retained = 0;
        let staging = 0;
        for (const [partition, hashes] of survey) {
            const scopeKey = replicaPartitionScopeKey(partition);
            if (scopeKey !== undefined && this.clearedScopes.has(scopeKey))
                continue;
            partitions++;
            const stored = await this.surveyManifest(partition, hashes);
            const live = await this.liveNodeHashes(partition, stored);
            if (live === undefined) {
                skipped++;
                continue;
            }
            const garbage = unreachableNodeHashes(stored.hashes, live);
            await this.boundaries.checkpoint("replica.gc.planned");
            const outcome = await this.sweepPartition(partition, stored, garbage, live);
            if (outcome === undefined) {
                skipped++;
                continue;
            }
            retained += stored.hashes.length - outcome.nodes;
            nodes += outcome.nodes;
            staging += outcome.staging;
            if (outcome.nodes > 0 || outcome.staging > 0)
                swept++;
        }
        return Object.freeze({ partitions, swept, skipped, nodes, retained, staging });
    }
    async surveyPartitions(prefix) {
        const transaction = this.database.transaction([COMMITTED, NODES, STAGING], "readonly");
        const keysOf = (store, compound) => requestResult(prefix === undefined
            ? transaction.objectStore(store).getAllKeys()
            : transaction.objectStore(store).getAllKeys(compound ? compoundPrefixRange(prefix) : prefixRange(prefix)));
        const [manifestKeys, nodeKeys, stagingKeys] = await Promise.all([
            keysOf(COMMITTED, false),
            keysOf(NODES, true),
            keysOf(STAGING, false),
        ]);
        await transactionDone(transaction);
        const survey = new Map();
        const at = (partition) => {
            const existing = survey.get(partition);
            if (existing !== undefined)
                return existing;
            const created = [];
            survey.set(partition, created);
            return created;
        };
        for (const key of nodeKeys) {
            if (!Array.isArray(key) || typeof key[0] !== "string" || typeof key[1] !== "string") {
                continue;
            }
            at(key[0]).push(key[1]);
        }
        for (const keys of [stagingKeys, manifestKeys]) {
            for (const key of keys)
                if (typeof key === "string")
                    at(key);
        }
        return survey;
    }
    async surveyManifest(partition, hashes) {
        const transaction = this.database.transaction(COMMITTED, "readonly");
        const record = await requestResult(transaction.objectStore(COMMITTED).get(partition));
        await transactionDone(transaction);
        return { hashes, fingerprint: replicaManifestFingerprint(record), record };
    }
    async liveNodeHashes(partition, stored) {
        const live = new Set();
        if (stored.record !== undefined) {
            const expected = storedReadCompatibilityHash(stored.record);
            if (expected === undefined)
                return undefined;
            const manifest = validateReplicaManifest(stored.record, {
                partition,
                readCompatibilityHash: expected,
            });
            if (Result.isFailure(manifest))
                return undefined;
            if (await validateReachableNodes(this.database, manifest.success, live) !== undefined) {
                return undefined;
            }
        }
        const retained = this.retainedRoots(partition);
        if (retained.length > 0) {
            const walk = await reachableFromRoots(this.database, partition, retained);
            if (!walk.complete)
                return undefined;
            for (const hash of walk.reachable)
                live.add(hash);
        }
        return live;
    }
    retainedRoots(partition) {
        const roots = [];
        for (const held of this.registry.retained.get(partition)?.values() ?? []) {
            roots.push(...held);
        }
        return roots;
    }
    async sweepPartition(partition, stored, garbage, live) {
        if (this.registry.materializing.has(partition))
            return undefined;
        if (this.retainedRoots(partition).some((hash) => !live.has(hash)))
            return undefined;
        const transaction = this.database.transaction([COMMITTED, NODES, STAGING, STAGING_CHUNKS, GENERATIONS], "readwrite");
        let sweptStaging = false;
        try {
            const sweepKey = replicaSweepKey(partition);
            const [current, staged, sweep] = await Promise.all([
                requestResult(transaction.objectStore(COMMITTED).get(partition)),
                requestResult(transaction.objectStore(STAGING).get(partition)),
                requestResult(transaction.objectStore(GENERATIONS).get(sweepKey)),
            ]);
            if (replicaManifestFingerprint(current) !== stored.fingerprint) {
                await abortTransaction(transaction);
                return undefined;
            }
            sweptStaging = stagingIsSweepable(staged, storedRevision(current));
            if (garbage.length === 0 && !sweptStaging) {
                await transactionDone(transaction);
                return { nodes: 0, staging: 0 };
            }
            const nodes = transaction.objectStore(NODES);
            for (const hash of garbage)
                nodes.delete([partition, hash]);
            if (sweptStaging) {
                transaction.objectStore(STAGING).delete(partition);
                transaction.objectStore(STAGING_CHUNKS).delete(chunkRange(partition));
            }
            if (garbage.length > 0) {
                transaction.objectStore(GENERATIONS).put({
                    key: sweepKey,
                    kind: "partition",
                    scope: replicaPartitionScopeKey(partition) ?? "",
                    generation: (sweep?.generation ?? 0) + 1,
                    confirmedAt: sweep?.confirmedAt ?? Date.now(),
                    fencedAt: Date.now(),
                });
            }
            await this.boundaries.checkpoint("replica.sweep");
        }
        catch (error) {
            await abortTransaction(transaction);
            throw error;
        }
        await commitTransaction(transaction);
        return { nodes: garbage.length, staging: sweptStaging ? 1 : 0 };
    }
    async committed(identity) {
        const transaction = this.database.transaction(COMMITTED, "readonly");
        const record = await requestResult(transaction.objectStore(COMMITTED).get(replicaPartitionKey(identity)));
        await transactionDone(transaction);
        return record;
    }
    async priorManifest(identity) {
        return await this.committed(identity);
    }
    async quarantinePartition(identity, options) {
        const partition = replicaPartitionKey(identity);
        const fence = replicaFence(options.lease ?? await this.leaseFor(identity), identity);
        const transaction = this.database.transaction([COMMITTED, COMMITTED_HEADS, CREDENTIAL_BINDINGS, CACHE_CANDIDATES, GENERATIONS], "readwrite");
        try {
            await enforceFence(transaction, fence);
            const current = await requestResult(transaction.objectStore(COMMITTED).get(partition));
            if (replicaManifestFingerprint(current) !== options.expect) {
                await abortTransaction(transaction);
                return false;
            }
            transaction.objectStore(COMMITTED).delete(partition);
            transaction.objectStore(COMMITTED_HEADS).delete(partition);
            const bindings = transaction.objectStore(CREDENTIAL_BINDINGS);
            if (options.fingerprint !== undefined) {
                bindings.delete(options.fingerprint);
            }
            else {
                const records = await requestResult(bindings.getAll());
                for (const binding of records) {
                    if (sameReplicationIdentity(binding.identity, identity)) {
                        bindings.delete(binding.fingerprint);
                    }
                }
            }
            const candidates = transaction.objectStore(CACHE_CANDIDATES);
            const candidateRecords = await requestResult(candidates.getAll());
            for (const candidate of candidateRecords) {
                if (sameReplicationIdentity(candidate.identity, identity)) {
                    candidates.delete([candidate.selector, candidate.routeSlot]);
                }
            }
            await this.boundaries.checkpoint("replica.quarantine");
        }
        catch (error) {
            await abortTransaction(transaction);
            throw error;
        }
        await commitTransaction(transaction);
        return true;
    }
    async validated(record, identity, attributes, readCompatibilityHash, fingerprint) {
        let current = record;
        for (let attempt = 1; attempt <= REPLICA_SWEEP_RESTORE_ATTEMPTS; attempt++) {
            const outcome = await this.validatedOnce(current, identity, attributes, readCompatibilityHash, fingerprint);
            if (outcome !== RECORD_MOVED)
                return outcome;
            current = await this.committed(identity);
            if (current === undefined)
                return replicaAbsent();
            const stored = replicaManifestIdentity(current);
            if (stored !== undefined && !sameReplicationIdentity(stored, identity)) {
                return replicaAbsent();
            }
        }
        return replicaContended(replicaPartitionKey(identity), REPLICA_SWEEP_RESTORE_ATTEMPTS);
    }
    async validatedOnce(record, identity, attributes, readCompatibilityHash, fingerprint) {
        const partition = replicaPartitionKey(identity);
        const expect = replicaManifestFingerprint(record);
        const lease = await this.leaseFor(identity);
        const sweep = await this.sweepGeneration(partition);
        const quarantine = async (reason, detail) => {
            await this.boundaries.checkpoint("replica.refused");
            const removed = await this.quarantinePartition(identity, {
                expect,
                lease,
                ...(fingerprint === undefined ? {} : { fingerprint }),
            });
            return removed
                ? replicaUnusable(partition, reason, detail)
                : RECORD_MOVED;
        };
        if (identity.readCompatibilityHash !== readCompatibilityHash) {
            return quarantine("read-compatibility", "the selected identity does not confirm this client's read compatibility");
        }
        const manifest = validateReplicaManifest(record, { partition, readCompatibilityHash });
        if (Result.isFailure(manifest)) {
            return quarantine(manifest.failure.reason, manifest.failure.detail);
        }
        if (!sameReplicaAttributes(manifest.success.attributes, replicaAttributes(attributes))) {
            return quarantine("schema-metadata", "replica attribute metadata is incompatible with the committed read view");
        }
        const invalid = await validateReachableNodes(this.database, manifest.success);
        if (invalid !== undefined)
            return quarantine(invalid.reason, invalid.detail);
        await this.boundaries.checkpoint("replica.validated");
        const retention = this.retainRoots(identity, manifest.success.roots);
        if (!await this.confirmGuardingGenerations(lease, identity, sweep)) {
            retention();
            return RECORD_MOVED;
        }
        return replicaRestored({ record: manifest.success, release: retention });
    }
    async confirmNoSweep(transaction, partition, observed) {
        const key = replicaSweepKey(partition);
        const record = await requestResult(transaction.objectStore(GENERATIONS).get(key));
        const current = record?.generation ?? 0;
        if (current === observed)
            return;
        await abortTransaction(transaction);
        throw new ReplicaFencedError({ key, expected: observed, observed: current });
    }
    async sweepGeneration(partition) {
        const transaction = this.database.transaction(GENERATIONS, "readonly");
        const record = await requestResult(transaction.objectStore(GENERATIONS).get(replicaSweepKey(partition)));
        await transactionDone(transaction);
        return record?.generation ?? 0;
    }
    async confirmGuardingGenerations(lease, identity, sweep) {
        const transaction = this.database.transaction(GENERATIONS, "readonly");
        await enforceFence(transaction, replicaFence(lease, identity));
        const record = await requestResult(transaction.objectStore(GENERATIONS).get(replicaSweepKey(replicaPartitionKey(identity))));
        await transactionDone(transaction);
        return (record?.generation ?? 0) === sweep;
    }
    async boundIdentity(fingerprint) {
        const transaction = this.database.transaction(CREDENTIAL_BINDINGS, "readonly");
        const record = await requestResult(transaction.objectStore(CREDENTIAL_BINDINGS).get(fingerprint));
        await transactionDone(transaction);
        return record?.identity;
    }
    async unbindCredential(fingerprint) {
        const transaction = this.database.transaction(CREDENTIAL_BINDINGS, "readwrite");
        transaction.objectStore(CREDENTIAL_BINDINGS).delete(fingerprint);
        await commitTransaction(transaction);
    }
    async restoreOutcome(identity, attributes, readCompatibilityHash) {
        this.assertScopeLive(replicaScopeOf(identity));
        const record = await this.committed(identity);
        if (record === undefined)
            return replicaAbsent();
        const stored = replicaManifestIdentity(record);
        if (stored !== undefined && !sameReplicationIdentity(stored, identity)) {
            return replicaAbsent();
        }
        const validated = await this.validated(record, identity, attributes, readCompatibilityHash);
        if (validated._tag !== "restored")
            return validated;
        return replicaRestored({
            db: dbFromRecord(this.database, validated.replica.record, readCompatibilityHash),
            revision: validated.replica.record.revision,
            handles: recordHandles(validated.replica.record),
            release: validated.replica.release,
        });
    }
    async restore(identity, attributes, readCompatibilityHash) {
        return restoredReplica(await this.restoreOutcome(identity, attributes, readCompatibilityHash));
    }
    async selectCacheCandidate(key, readCompatibilityHash) {
        const transaction = this.database.transaction([CACHE_CANDIDATES, COMMITTED_HEADS], "readonly");
        const binding = await requestResult(transaction.objectStore(CACHE_CANDIDATES).get([key.selector, key.routeSlot]));
        if (binding === undefined ||
            binding.identity.readCompatibilityHash !== readCompatibilityHash) {
            await transactionDone(transaction);
            return undefined;
        }
        const head = await requestResult(transaction.objectStore(COMMITTED_HEADS).get(replicaPartitionKey(binding.identity)));
        await transactionDone(transaction);
        if (head === undefined ||
            head.storageVersion !== REPLICA_STORAGE_VERSION ||
            head.partition !== replicaPartitionKey(binding.identity) ||
            head.readCompatibilityHash !== readCompatibilityHash ||
            head.identity.readCompatibilityHash !== readCompatibilityHash ||
            !sameReplicationIdentity(head.identity, binding.identity)) {
            return undefined;
        }
        return Object.freeze({
            identity: binding.identity,
            revision: head.revision,
        });
    }
    async restoreCandidateOutcome(candidate, attributes, readCompatibilityHash) {
        this.assertScopeLive(replicaScopeOf(candidate.identity));
        const record = await this.committed(candidate.identity);
        if (record === undefined)
            return replicaAbsent();
        const stored = replicaManifestIdentity(record);
        if (stored !== undefined && !sameReplicationIdentity(stored, candidate.identity)) {
            return replicaAbsent();
        }
        const validated = await this.validated(record, candidate.identity, attributes, readCompatibilityHash);
        if (validated._tag !== "restored")
            return validated;
        if (validated.replica.record.revision !== candidate.revision) {
            validated.replica.release();
            return replicaAbsent();
        }
        return replicaRestored({
            identity: candidate.identity,
            db: dbFromRecord(this.database, validated.replica.record, readCompatibilityHash),
            revision: validated.replica.record.revision,
            handles: recordHandles(validated.replica.record),
            release: validated.replica.release,
        });
    }
    async restoreConfirmedCandidate(candidate, attributes, readCompatibilityHash) {
        return restoredReplica(await this.restoreCandidateOutcome(candidate, attributes, readCompatibilityHash));
    }
    async graphReceiver(receiver) {
        const transaction = this.database.transaction(GRAPH_RECEIVERS, "readonly");
        const record = await requestResult(transaction.objectStore(GRAPH_RECEIVERS).get(replicaDatabaseKey(receiver)));
        await transactionDone(transaction);
        return record?.version === REPLICA_GRAPH_RECEIVER_VERSION &&
            record.graphPath.length > 0
            ? record
            : undefined;
    }
    async observedRouteSlot(observation) {
        const transaction = this.database.transaction(ROUTE_SLOTS, "readonly");
        const record = await requestResult(transaction.objectStore(ROUTE_SLOTS).get([observation.scope, observation.pathKey]));
        await transactionDone(transaction);
        return record?.slot;
    }
    async bindAuthenticated(binding, options = {}) {
        const scopeKey = this.assertScopeLive(replicaScopeOf(binding.identity));
        const databaseKey = replicaDatabaseKey(replicaDatabaseScopeOf(binding.identity));
        const transaction = this.database.transaction([CREDENTIAL_BINDINGS, CACHE_CANDIDATES, ROUTE_SLOTS, GRAPH_RECEIVERS, GENERATIONS], "readwrite");
        const removeAbort = abortWithSignal(transaction, options.signal);
        try {
            const generations = transaction.objectStore(GENERATIONS);
            const candidates = transaction.objectStore(CACHE_CANDIDATES);
            const [scopeRecord, databaseRecord, existingRoute] = await Promise.all([
                requestResult(generations.get(scopeKey)),
                requestResult(generations.get(databaseKey)),
                binding.route === undefined
                    ? undefined
                    : requestResult(transaction.objectStore(ROUTE_SLOTS).get([binding.route.scope, binding.route.pathKey])),
            ]);
            for (const seeded of confirmationRecords(binding.identity, Date.now())) {
                const existing = seeded.kind === "scope" ? scopeRecord : databaseRecord;
                if (existing === undefined)
                    generations.put(seeded);
            }
            if (options.lease !== undefined) {
                try {
                    options.lease.observe(scopeKey, scopeRecord?.generation ?? 1);
                    options.lease.observe(databaseKey, databaseRecord?.generation ?? 1);
                    options.lease.admit(scopeKey, scopeRecord?.clearedAt ?? 0);
                }
                catch (error) {
                    await abortTransaction(transaction);
                    throw error;
                }
            }
            const replaced = await this.stageReplacedPrincipals(transaction, binding.identity, binding.candidateKey?.selector);
            transaction.objectStore(CREDENTIAL_BINDINGS).put({
                fingerprint: binding.fingerprint,
                identity: binding.identity,
            });
            if (binding.candidateKey !== undefined) {
                candidates.put({
                    selector: binding.candidateKey.selector,
                    routeSlot: binding.candidateKey.routeSlot,
                    identity: binding.identity,
                });
            }
            if (binding.route !== undefined) {
                transaction.objectStore(ROUTE_SLOTS).put({
                    scope: binding.route.scope,
                    pathKey: binding.route.pathKey,
                    slot: binding.route.slot,
                    replicaScopes: withConfirmedScope(existingRoute?.slot === binding.route.slot
                        ? existingRoute.replicaScopes
                        : undefined, scopeKey),
                });
                const graphPath = binding.route.graphPath ?? [];
                if (graphPath.length > 0 &&
                    graphPath.length === binding.identity.graphLineage.length) {
                    transaction.objectStore(GRAPH_RECEIVERS).put({
                        key: databaseKey,
                        version: REPLICA_GRAPH_RECEIVER_VERSION,
                        scope: scopeKey,
                        route: binding.route.scope,
                        graphPath: [...graphPath],
                        graphLineage: [...binding.identity.graphLineage],
                        confirmedAt: Date.now(),
                    });
                }
            }
            await commitTransaction(transaction);
            for (const scope of replaced)
                this.announce(replicaNotice("reset", scope));
            this.announce(identityNotice("selector", binding.identity));
        }
        finally {
            removeAbort();
        }
    }
    async stageReplacedPrincipals(transaction, confirmed, selector) {
        if (selector === undefined)
            return [];
        const held = await requestResult(transaction.objectStore(CACHE_CANDIDATES).getAll(compoundPrefixRange(selector)));
        const replaced = new Map();
        for (const candidate of held) {
            const previous = replicaScopeOf(candidate.identity);
            if (identityInScope(confirmed, previous))
                continue;
            replaced.set(replicaScopeKey(previous), previous);
        }
        if (replaced.size === 0)
            return [];
        const generations = transaction.objectStore(GENERATIONS);
        const clearedAt = await this.advanceBarrier(generations);
        for (const key of replaced.keys()) {
            const record = await requestResult(generations.get(key));
            generations.put({
                key,
                kind: "scope",
                scope: key,
                generation: (record?.generation ?? 0) + 1,
                confirmedAt: record?.confirmedAt ?? Date.now(),
                fencedAt: Date.now(),
                clearedAt,
            });
        }
        return Object.freeze([...replaced.values()]);
    }
    async advanceBarrier(generations, held) {
        const barrier = held ?? await requestResult(generations.get(REPLICA_CLEAR_BARRIER_KEY));
        const generation = (barrier?.generation ?? 0) + 1;
        generations.put({
            key: REPLICA_CLEAR_BARRIER_KEY,
            kind: "barrier",
            scope: REPLICA_CLEAR_BARRIER_KEY,
            generation,
            confirmedAt: barrier?.confirmedAt ?? Date.now(),
            fencedAt: Date.now(),
        });
        return generation;
    }
    async bindCredential(fingerprint, identity, options = {}) {
        await this.bindAuthenticated({ fingerprint, identity }, options);
    }
    async restoreBoundOutcome(fingerprint, attributes, readCompatibilityHash) {
        const transaction = this.database.transaction([CREDENTIAL_BINDINGS, COMMITTED], "readonly");
        const binding = await requestResult(transaction.objectStore(CREDENTIAL_BINDINGS).get(fingerprint));
        if (binding === undefined) {
            await transactionDone(transaction);
            return replicaAbsent();
        }
        const record = await requestResult(transaction.objectStore(COMMITTED).get(replicaPartitionKey(binding.identity)));
        await transactionDone(transaction);
        if (record === undefined)
            return replicaAbsent();
        const stored = replicaManifestIdentity(record);
        if (stored !== undefined && !sameReplicationIdentity(stored, binding.identity)) {
            await this.unbindCredential(fingerprint);
            return replicaAbsent();
        }
        const validated = await this.validated(record, binding.identity, attributes, readCompatibilityHash, fingerprint);
        if (validated._tag !== "restored")
            return validated;
        return replicaRestored({
            identity: binding.identity,
            db: dbFromRecord(this.database, validated.replica.record, readCompatibilityHash),
            revision: validated.replica.record.revision,
            handles: recordHandles(validated.replica.record),
            release: validated.replica.release,
        });
    }
    async restoreBound(fingerprint, attributes, readCompatibilityHash) {
        return restoredReplica(await this.restoreBoundOutcome(fingerprint, attributes, readCompatibilityHash));
    }
    async resetStaging(identity, options = {}) {
        this.assertScopeLive(replicaScopeOf(identity));
        const fence = replicaFence(options.lease, identity);
        const partition = replicaPartitionKey(identity);
        const transaction = this.database.transaction(fence === undefined
            ? [STAGING, STAGING_CHUNKS]
            : [STAGING, STAGING_CHUNKS, GENERATIONS], "readwrite");
        const removeAbort = abortWithSignal(transaction, options.signal);
        try {
            await enforceFence(transaction, fence);
            transaction.objectStore(STAGING).delete(partition);
            transaction.objectStore(STAGING_CHUNKS).delete(chunkRange(partition));
            await commitTransaction(transaction);
            this.announce(identityNotice("reset", identity));
        }
        finally {
            removeAbort();
        }
    }
    async startSnapshot(frame, options = {}) {
        this.assertScopeLive(replicaScopeOf(frame.identity));
        const fence = replicaFence(options.lease, frame.identity);
        const partition = replicaPartitionKey(frame.identity);
        const transaction = this.database.transaction(fence === undefined
            ? [COMMITTED, STAGING, STAGING_CHUNKS]
            : [COMMITTED, STAGING, STAGING_CHUNKS, GENERATIONS], "readwrite");
        const removeAbort = abortWithSignal(transaction, options.signal);
        try {
            await enforceFence(transaction, fence);
            const staging = transaction.objectStore(STAGING);
            const [current, committed] = await Promise.all([
                requestResult(staging.get(partition)),
                requestResult(transaction.objectStore(COMMITTED).get(partition)),
            ]);
            if (current !== undefined && current.snapshot === frame.snapshot &&
                current.revision === frame.revision &&
                sameReplicationIdentity(current.identity, frame.identity) &&
                current.baseRevision === (committed?.revision ?? null)) {
                await transactionDone(transaction);
                return;
            }
            staging.put({
                partition,
                identity: frame.identity,
                snapshot: frame.snapshot,
                revision: frame.revision,
                baseRevision: committed?.revision ?? null,
            });
            transaction.objectStore(STAGING_CHUNKS).delete(chunkRange(partition));
            await commitTransaction(transaction);
            this.meter.staging++;
        }
        finally {
            removeAbort();
        }
    }
    async stageSnapshotChunk(frame, options = {}) {
        this.assertScopeLive(replicaScopeOf(frame.identity));
        const fence = replicaFence(options.lease, frame.identity);
        const partition = replicaPartitionKey(frame.identity);
        const transaction = this.database.transaction(fence === undefined
            ? [STAGING, STAGING_CHUNKS]
            : [STAGING, STAGING_CHUNKS, GENERATIONS], "readwrite");
        const removeAbort = abortWithSignal(transaction, options.signal);
        try {
            await enforceFence(transaction, fence);
            const staging = await requestResult(transaction.objectStore(STAGING).get(partition));
            if (staging === undefined || staging.snapshot !== frame.snapshot ||
                !sameReplicationIdentity(staging.identity, frame.identity)) {
                await abortTransaction(transaction);
                return;
            }
            const chunks = transaction.objectStore(STAGING_CHUNKS);
            const existing = await requestResult(chunks.get([partition, frame.index]));
            if (existing !== undefined && !sameJson(existing.datoms, frame.datoms)) {
                await abortTransaction(transaction);
                throw new ReplicationTransitionError({
                    reason: "duplicate snapshot chunk changed bytes",
                });
            }
            if (existing === undefined) {
                chunks.put({
                    partition,
                    index: frame.index,
                    datoms: frame.datoms,
                    handles: frame.handles,
                });
                await commitTransaction(transaction);
                this.meter.stagingChunks++;
                return;
            }
            await commitTransaction(transaction);
        }
        finally {
            removeAbort();
        }
    }
    async stagedState(frame) {
        const partition = replicaPartitionKey(frame.identity);
        const transaction = this.database.transaction([STAGING, STAGING_CHUNKS], "readonly");
        const staging = await requestResult(transaction.objectStore(STAGING).get(partition));
        const chunks = await requestResult(transaction.objectStore(STAGING_CHUNKS).getAll(chunkRange(partition)));
        await transactionDone(transaction);
        if (staging === undefined) {
            return { state: emptyClientReplicationState(), baseRevision: null };
        }
        let state = transition(emptyClientReplicationState(), {
            type: "SnapshotStart",
            protocol: 1,
            identity: staging.identity,
            snapshot: staging.snapshot,
            revision: staging.revision,
        });
        for (const chunk of chunks.sort((a, b) => a.index - b.index)) {
            state = transition(state, {
                type: "SnapshotChunk",
                protocol: 1,
                identity: staging.identity,
                snapshot: staging.snapshot,
                index: chunk.index,
                datoms: chunk.datoms,
                handles: chunk.handles ?? [],
            });
        }
        return { state: transition(state, frame), baseRevision: staging.baseRevision };
    }
    async installWithQuotaRecovery(partition, signal, install) {
        let reclaimedNodes = 0;
        for (let attempt = 1;; attempt++) {
            try {
                return await install();
            }
            catch (error) {
                const recovery = replicaQuotaRecovery(attempt, classifyReplicaStorageFailure(error));
                if (recovery === "propagate")
                    throw error;
                if (recovery === "exhausted") {
                    throw new ReplicaQuotaExhaustedError({ partition, reclaimedNodes });
                }
                signal?.throwIfAborted();
                await this.boundaries.checkpoint("replica.quota");
                try {
                    reclaimedNodes = (await this.collectGarbage()).nodes;
                }
                catch (sweepError) {
                    if (classifyReplicaStorageFailure(sweepError) !== "quota")
                        throw sweepError;
                }
            }
        }
    }
    async commitSnapshot(frame, attributes, options = {}) {
        this.assertScopeLive(replicaScopeOf(frame.identity));
        const installed = await this.installWithQuotaRecovery(replicaPartitionKey(frame.identity), options.signal, () => this.commitSnapshotOnce(frame, attributes, options));
        if (installed !== undefined) {
            this.announce(identityNotice("replica", frame.identity));
        }
        return installed;
    }
    async commitSnapshotOnce(frame, attributes, options) {
        const fence = replicaFence(options.lease, frame.identity);
        const [staged, prior] = await Promise.all([
            this.stagedState(frame),
            this.priorManifest(frame.identity),
        ]);
        const committed = staged.state.committed;
        if (committed?.revision !== frame.revision)
            return undefined;
        if ((prior?.revision ?? null) !== staged.baseRevision)
            return undefined;
        const partition = replicaPartitionKey(frame.identity);
        const materializing = this.markMaterializing(partition);
        try {
            const sweep = await this.sweepGeneration(partition);
            return await this.installSnapshot(frame, attributes, options, committed, staged.baseRevision, prior, fence, partition, sweep);
        }
        finally {
            materializing();
        }
    }
    async installSnapshot(frame, attributes, options, committed, baseRevision, prior, fence, partition, sweep) {
        const built = await materialize(this.database, frame.identity, committed, attributes, prior, options.signal, fence, this.meter);
        options.signal?.throwIfAborted();
        await this.boundaries.checkpoint("replica.installing");
        const transaction = this.database.transaction([COMMITTED, COMMITTED_HEADS, STAGING, STAGING_CHUNKS, GENERATIONS], "readwrite");
        const removeAbort = abortWithSignal(transaction, options.signal);
        try {
            await enforceFence(transaction, fence);
            await this.confirmNoSweep(transaction, partition, sweep);
            const current = await requestResult(transaction.objectStore(STAGING).get(built.record.partition));
            const currentCommitted = await requestResult(transaction.objectStore(COMMITTED).get(built.record.partition));
            if (current === undefined || current.snapshot !== frame.snapshot ||
                current.revision !== frame.revision ||
                !sameReplicationIdentity(current.identity, frame.identity) ||
                (currentCommitted?.revision ?? null) !== baseRevision) {
                await abortTransaction(transaction);
                return undefined;
            }
            transaction.objectStore(COMMITTED).put(built.record);
            transaction.objectStore(COMMITTED_HEADS).put(committedHead(built.record));
            transaction.objectStore(STAGING).delete(built.record.partition);
            transaction.objectStore(STAGING_CHUNKS).delete(chunkRange(built.record.partition));
            await this.boundaries.checkpoint("replica.install");
            await commitTransaction(transaction);
            this.meter.manifests++;
            this.meter.heads++;
        }
        catch (error) {
            await abortTransaction(transaction);
            throw error;
        }
        finally {
            removeAbort();
        }
        return {
            db: built.db,
            revision: built.record.revision,
            handles: recordHandles(built.record),
            release: this.retainRoots(frame.identity, built.record.roots),
        };
    }
    async applyChange(frame, options = {}) {
        this.assertScopeLive(replicaScopeOf(frame.identity));
        const installed = await this.installWithQuotaRecovery(replicaPartitionKey(frame.identity), options.signal, () => this.applyChangeOnce(frame, options));
        if (installed !== undefined) {
            this.announce(identityNotice("replica", frame.identity));
        }
        return installed;
    }
    async applyChangeOnce(frame, options) {
        const fence = replicaFence(options.lease, frame.identity);
        const partition = replicaPartitionKey(frame.identity);
        const read = this.database.transaction(COMMITTED, "readonly");
        const prior = await requestResult(read.objectStore(COMMITTED).get(partition));
        await transactionDone(read);
        if (prior === undefined)
            return undefined;
        const state = transition({
            identity: prior.identity,
            committed: {
                revision: prior.revision,
                datoms: prior.datoms,
                handles: new Map(prior.entityHandles),
            },
            closed: false,
        }, frame);
        if (state.committed === undefined || state.committed.revision === prior.revision) {
            return {
                db: dbFromRecord(this.database, prior, frame.identity.readCompatibilityHash),
                revision: prior.revision,
                handles: recordHandles(prior),
                release: this.retainRoots(frame.identity, prior.roots),
            };
        }
        const materializing = this.markMaterializing(partition);
        try {
            const sweep = await this.sweepGeneration(partition);
            return await this.installChange(frame, options, state.committed, prior, fence, partition, sweep);
        }
        finally {
            materializing();
        }
    }
    async installChange(frame, options, committed, prior, fence, partition, sweep) {
        const built = await materialize(this.database, frame.identity, committed, prior.attributes, prior, options.signal, fence, this.meter);
        options.signal?.throwIfAborted();
        await this.boundaries.checkpoint("replica.installing");
        const write = this.database.transaction([COMMITTED, COMMITTED_HEADS, GENERATIONS], "readwrite");
        const removeAbort = abortWithSignal(write, options.signal);
        try {
            await enforceFence(write, fence);
            await this.confirmNoSweep(write, partition, sweep);
            const current = await requestResult(write.objectStore(COMMITTED).get(partition));
            if (current?.revision !== prior.revision) {
                await abortTransaction(write);
                return undefined;
            }
            write.objectStore(COMMITTED).put(built.record);
            write.objectStore(COMMITTED_HEADS).put(committedHead(built.record));
            await this.boundaries.checkpoint("replica.install");
            await commitTransaction(write);
            this.meter.manifests++;
            this.meter.heads++;
        }
        catch (error) {
            await abortTransaction(write);
            throw error;
        }
        finally {
            removeAbort();
        }
        return {
            db: built.db,
            revision: built.record.revision,
            handles: recordHandles(built.record),
            release: this.retainRoots(frame.identity, built.record.roots),
        };
    }
}
//# sourceMappingURL=indexeddb.js.map