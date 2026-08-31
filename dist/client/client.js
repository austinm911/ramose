import { isSchemaDefinition, } from "../db/Schema.js";
import { DEFAULT_REPLICA_DATABASE_NAME, IndexedDbReplicaStorage, } from "../internal/replication/indexeddb.js";
import { replicaDatabaseKey, replicaDatabaseScopeOf, replicaScopeKey, replicaScopeOf, } from "../internal/replication/replica-lifecycle.js";
import { observeActivation } from "./activation.js";
import { platformLocks, replicaLeaderKey, SyncLeadership, } from "../internal/replication/leadership.js";
import { replicationActivationAddress } from "../internal/replication/transport.js";
import { completeSchema } from "../internal/authorization/read-tables.js";
import { compositionFromSchema } from "../db/composition.js";
import { installClientCatalog } from "./catalog.js";
import { installClientOperations, selfOperationsFor, } from "./operations.js";
import { SubmissionLoop } from "./submission.js";
import { ClientClosedError, ClientConfigurationError, ClientLocalDataError, } from "./errors.js";
import { ClientDatabaseHandle, } from "./database.js";
import { fencedReceiver, GraphRegistry, receiverStableKey } from "./graph.js";
import { Store } from "./subscription.js";
import { aggregateSyncStatus, syncState } from "./sync.js";
const nonEmpty = (value) => typeof value === "string" && value.length > 0;
const settled = (status) => status !== "idle" && status !== "connecting";
const SCOPE_CONFIRMATION_TIMEOUT_MS = 10_000;
class RamoseClient {
    options;
    server;
    syncStore = new Store(syncState("idle"));
    sync = this.syncStore.subscription;
    root;
    graph;
    catalogBuild;
    storageHandle;
    confirmed;
    operations;
    compositionIndex;
    submissionLoop;
    leadership;
    leaderName;
    releaseInvalidation;
    releaseNotices;
    releaseActivation;
    receivers = new Map();
    terminal;
    termination;
    clearing = false;
    constructor(options, server) {
        this.options = options;
        this.server = server;
    }
    open() {
        this.assertLive("open");
        return this.rootHandle();
    }
    rootHandle() {
        if (this.root !== undefined)
            return this.root;
        const root = new ClientDatabaseHandle({
            ...this.databaseContext(),
            graphPath: [],
        });
        this.root = root;
        return root;
    }
    databaseContext() {
        return {
            server: this.server,
            root: this.options.root,
            graph: () => this.graphRegistry(),
            catalog: () => this.catalog(),
            storage: () => this.storage(),
            credential: () => this.credential(),
            assertLive: (operation) => this.assertLive(operation),
            live: () => this.terminal === undefined,
            onSyncChange: () => this.refreshSync(),
            onConfirmed: (identity) => {
                this.confirm(identity);
                this.elect(identity);
            },
            onFenced: () => {
                void this.terminate(this.clearing ? "cleared" : "fenced");
            },
            mutations: this.mutationContext(),
        };
    }
    handles() {
        return [
            ...(this.root === undefined ? [] : [this.root]),
            ...(this.graph?.handles() ?? []),
        ];
    }
    handleByKey(key) {
        if (key === undefined)
            return this.handles();
        return this.handles().filter((handle) => {
            const scope = handle.confirmedScope();
            return scope !== undefined && replicaDatabaseKey(scope) === key;
        });
    }
    receive(notice) {
        const identity = this.confirmed;
        if (this.terminal !== undefined || identity === undefined)
            return;
        const scope = replicaScopeOf(identity);
        if (replicaScopeKey(scope) !== notice.scope)
            return;
        switch (notice.kind) {
            case "replica":
                for (const handle of this.handleByKey(notice.database)) {
                    void handle.refreshCommitted();
                }
                return;
            case "reset":
                for (const handle of this.handleByKey(notice.database)) {
                    void handle.revalidate().then(() => handle.refreshCommitted());
                }
                return;
            case "layer":
                for (const handle of this.handleByKey(notice.database)) {
                    void handle.refreshOptimistic();
                }
                this.submissions().request(scope);
                return;
            case "receipt":
            case "fence":
                for (const handle of this.handleByKey(notice.database)) {
                    void handle.refreshOptimistic();
                }
                void this.submissions().settleFromDurable();
                return;
            case "selector":
                for (const handle of this.handles()) {
                    handle.reactivateUnconfirmed();
                    handle.reactivateRefused();
                }
                return;
        }
    }
    wake() {
        if (this.terminal !== undefined)
            return;
        const revalidated = this.revalidate();
        for (const handle of this.handles()) {
            void handle.refreshOptimistic();
            handle.reactivateUnconfirmed();
            handle.reactivateRefused();
            handle.reactivateOffline();
        }
        void revalidated.then(() => {
            if (this.terminal !== undefined)
                return;
            for (const handle of this.handles())
                void handle.refreshCommitted();
            void this.submissions().settleFromDurable();
            const identity = this.confirmed;
            if (identity !== undefined)
                this.submissions().request(replicaScopeOf(identity));
        });
    }
    async revalidate() {
        await Promise.all(this.handles().map((handle) => handle.revalidate()));
    }
    confirm(identity, held = true) {
        const previous = this.confirmed;
        if (held || previous === undefined)
            this.confirmed = identity;
        if (previous === undefined ||
            replicaScopeKey(replicaScopeOf(previous)) ===
                replicaScopeKey(replicaScopeOf(identity)))
            return;
        void this.revalidate();
    }
    composition() {
        this.compositionIndex ??= compositionFromSchema(completeSchema(this.options.catalog));
        return this.compositionIndex;
    }
    clientOperations() {
        this.operations ??= installClientOperations(this.options.catalog, completeSchema(this.options.catalog));
        return this.operations;
    }
    mutationContext() {
        return {
            databaseOperations: () => this.clientOperations().database,
            selfOperations: (focus) => selfOperationsFor(this.clientOperations(), this.composition(), focus),
            catalog: () => this.catalog(),
            storage: () => this.storage(),
            assertLive: (operation) => this.assertLive(operation),
            submit: (receiver) => this.submissions().request(receiver),
            applied: (receiver) => this.observeLayers(replicaDatabaseKey(receiver)),
            track: (receiver, driver) => this.submissions().track(receiver, driver),
        };
    }
    observeLayers(database) {
        if (this.terminal !== undefined)
            return;
        for (const handle of this.handleByKey(database)) {
            void handle.refreshOptimistic();
        }
    }
    closeSubmissions() {
        this.submissionLoop?.close();
    }
    elect(identity) {
        if (this.terminal !== undefined)
            return;
        const scope = replicaScopeOf(identity);
        const name = replicaLeaderKey(replicaDatabaseScopeOf(identity), this.storageName());
        if (this.leaderName === name)
            return;
        this.leaderName = name;
        const stood = this.leadership;
        if (stood !== undefined)
            void stood.release();
        const leadership = SyncLeadership.begin({
            name,
            locks: platformLocks(),
            claim: async () => (await this.storage()).claimLeadership(name, scope),
            onLeading: () => {
                if (this.terminal === undefined)
                    this.submissions().request(scope);
            },
        });
        this.leadership = leadership;
        this.releaseInvalidation?.();
        this.releaseInvalidation = undefined;
        void this.storage().then((storage) => {
            const release = storage.onInvalidated(() => void leadership.release());
            if (this.leadership === leadership)
                this.releaseInvalidation = release;
            else
                release();
        }, () => undefined);
    }
    submissions() {
        this.submissionLoop ??= new SubmissionLoop({
            storage: () => this.storage(),
            leadership: () => this.leadership,
            credential: () => this.credential(),
            endpoint: (receiver, credential) => this.endpointFor(receiver, credential),
            resolve: (receiver) => this.resolveReceiver(receiver),
            retire: (receiver) => this.retireReceiver(receiver),
            revalidate: () => this.revalidate(),
            reconcile: async (receiver, progress) => {
                await this.databaseFor(receiver)?.reconcileSubmissions(progress);
            },
            live: () => this.terminal === undefined,
        });
        return this.submissionLoop;
    }
    resolveReceiver(receiver) {
        const key = replicaDatabaseKey(receiver);
        if (this.terminal !== undefined || this.receivers.has(key))
            return;
        if (this.databaseFor(receiver) !== undefined)
            return;
        this.receivers.set(key, undefined);
        void this.storage().then(async (storage) => {
            const record = await storage.graphReceiver(receiver);
            if (record === undefined || this.terminal !== undefined) {
                this.receivers.delete(key);
                return;
            }
            const handle = this.graphRegistry()
                .acquire(receiverStableKey(receiver), record.graphPath, this);
            this.receivers.set(key, handle);
            handle.activateGraph();
        }, () => {
            this.receivers.delete(key);
        });
    }
    retireReceiver(receiver) {
        const key = replicaDatabaseKey(receiver);
        if (!this.receivers.delete(key))
            return;
        this.graph?.retire(receiverStableKey(receiver), this);
    }
    databaseFor(receiver) {
        const key = replicaDatabaseKey(receiver);
        const candidates = [
            ...(this.root === undefined ? [] : [this.root]),
            ...(this.graph?.handles() ?? []),
        ];
        return candidates.find((handle) => {
            const scope = handle.confirmedScope();
            return scope !== undefined && replicaDatabaseKey(scope) === key;
        });
    }
    endpointFor(receiver, credential) {
        const handle = this.databaseFor(receiver);
        if (handle === undefined)
            return undefined;
        if (!handle.authenticatedBy(credential))
            return undefined;
        const fenced = fencedReceiver(handle.syncStatus());
        if (fenced !== undefined)
            return undefined;
        return {
            origin: this.server,
            database: this.options.root,
            graphPath: handle.graphPath(),
            credential: credential.token,
        };
    }
    graphRegistry() {
        this.graph ??= new GraphRegistry(({ graphPath, graphLineage, onConfirmed }) => new ClientDatabaseHandle({
            ...this.databaseContext(),
            graphPath,
            graphLineage,
            onConfirmed: (identity) => {
                onConfirmed(identity);
                this.confirm(identity, false);
            },
        }), () => this.refreshSync());
        return this.graph;
    }
    assertLive(operation) {
        if (this.terminal !== undefined) {
            throw new ClientClosedError({ operation, reason: this.terminal });
        }
    }
    catalog() {
        this.catalogBuild ??= installClientCatalog(this.options.catalog, this.clientOperations().installed);
        return this.catalogBuild;
    }
    storageName() {
        return this.options.storageName ?? DEFAULT_REPLICA_DATABASE_NAME;
    }
    storage() {
        this.storageHandle ??= IndexedDbReplicaStorage.open(this.storageName())
            .then((storage) => {
            if (this.terminal !== undefined)
                return storage;
            this.releaseNotices = storage.notices((notice) => this.receive(notice));
            this.releaseActivation ??= observeActivation(() => this.wake());
            return storage;
        });
        return this.storageHandle;
    }
    async credential() {
        const credential = await this.options.auth();
        if (credential === null || typeof credential !== "object" ||
            !nonEmpty(credential.token) || !nonEmpty(credential.cacheKey)) {
            throw new ClientConfigurationError({
                message: "auth() must return { token, cacheKey } as non-empty strings",
            });
        }
        return { token: credential.token, cacheKey: credential.cacheKey };
    }
    refreshSync() {
        if (this.terminal !== undefined) {
            this.syncStore.publish(syncState("closed"));
            return;
        }
        const errands = new Set(this.receivers.values());
        const statuses = [
            ...(this.root === undefined ? [] : [this.root.syncStatus()]),
            ...(this.graph?.handles() ?? [])
                .filter((handle) => !errands.has(handle))
                .map((handle) => handle.syncStatus()),
        ];
        this.syncStore.publish(syncState(aggregateSyncStatus(statuses)));
    }
    async close() {
        await this.terminate("closed");
    }
    async clearLocalData() {
        this.assertLive("clearLocalData");
        if (this.confirmed === undefined)
            await this.confirmScope();
        const identity = this.confirmed;
        if (identity === undefined) {
            throw new ClientLocalDataError({ reason: "no-confirmed-scope" });
        }
        const storage = await this.storage();
        this.clearing = true;
        try {
            await storage.clearScope(replicaScopeOf(identity));
        }
        catch (cause) {
            this.clearing = false;
            throw new ClientLocalDataError({ reason: "storage", cause });
        }
        await this.terminate("cleared");
    }
    async confirmScope() {
        const root = this.rootHandle();
        void root.activate();
        if (settled(root.sync.getSnapshot().status))
            return;
        await new Promise((resolve) => {
            const timer = setTimeout(() => {
                stop();
                resolve();
            }, SCOPE_CONFIRMATION_TIMEOUT_MS);
            const release = root.sync.subscribe(() => {
                if (!settled(root.sync.getSnapshot().status))
                    return;
                stop();
                resolve();
            });
            const stop = () => {
                clearTimeout(timer);
                release();
            };
            if (settled(root.sync.getSnapshot().status)) {
                stop();
                resolve();
            }
        });
    }
    async terminate(reason) {
        this.termination ??= this.shutdown(reason);
        await this.termination;
    }
    async shutdown(reason) {
        this.terminal = reason;
        this.releaseActivation?.();
        this.releaseActivation = undefined;
        this.releaseNotices?.();
        this.releaseNotices = undefined;
        this.releaseInvalidation?.();
        this.releaseInvalidation = undefined;
        this.closeSubmissions();
        await this.submissionLoop?.settled();
        await this.leadership?.release();
        await this.graph?.close();
        await this.root?.close();
        await this.storageHandle?.then((storage) => storage.close(), () => undefined);
        this.syncStore.publish(syncState("closed"));
    }
}
/**
 * Bind one server, one configured root route, one installed catalog, and one
 * refreshable credential provider.
 *
 * @throws ClientConfigurationError when any of them cannot be bound. None of
 * these become valid later, so they fail here rather than at the first query.
 */
export const createClient = (options) => {
    if (!nonEmpty(options?.root)) {
        throw new ClientConfigurationError({
            message: "createClient needs a configured root route",
        });
    }
    if (!isSchemaDefinition(options.catalog)) {
        throw new ClientConfigurationError({
            message: "createClient needs a named Ramose schema",
        });
    }
    if (typeof options.auth !== "function") {
        throw new ClientConfigurationError({
            message: "createClient needs an auth() provider returning { token, cacheKey }",
        });
    }
    let server;
    try {
        server = replicationActivationAddress({
            server: options.url,
            root: options.root,
            graphPath: [],
        }).origin;
    }
    catch (cause) {
        throw new ClientConfigurationError({
            message: cause instanceof Error ? cause.message : String(cause),
        });
    }
    return new RamoseClient(options, server);
};
//# sourceMappingURL=client.js.map