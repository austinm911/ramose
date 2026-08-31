import { NotOne } from "../db/Errors.js";
import { lowerQueryObject, symbolicIdentityLowering, } from "../db/query/index.js";
import { query as runQuery } from "../internal/core/query/engine.js";
import { emptyOverlayLayers } from "../internal/replication/overlay-layers.js";
import { OptimisticReconciler, } from "../internal/replication/reconciliation.js";
import { isReplicaFenceError, replicaDatabaseKey, replicaDatabaseScopeOf, } from "../internal/replication/replica-lifecycle.js";
import { ReplicationSession, } from "../internal/replication/session.js";
import { sameReplicationIdentity } from "../internal/replication/state.js";
import { clientQueryFrom, entityFocusOf, GraphDatabaseHandle, } from "./graph.js";
import { mutationNamespace } from "./mutation.js";
import { EntityRegistry, rowIdentity, } from "./entity.js";
import { Store, sameResult } from "./subscription.js";
import { syncState } from "./sync.js";
export const queryObservationKey = (query) => {
    const { lowering, identities } = symbolicIdentityLowering();
    const lowered = lowerQueryObject(query, lowering);
    const focus = entityFocusOf(query);
    return JSON.stringify([
        lowered.query,
        lowered.shape,
        identities,
        focus === undefined ? null : `${focus._tag}:${focus.ns}`,
    ]);
};
const PENDING = Object.freeze({
    status: "pending",
    data: undefined,
    stale: true,
    error: undefined,
});
export const readSessionSnapshot = (snapshot) => {
    switch (snapshot.status) {
        case "open":
            return {
                status: snapshot.value?.stale === true ? "stale" : "live",
                publishes: true,
            };
        case "connecting":
            return {
                status: snapshot.value === undefined ? "connecting" : "stale",
                publishes: true,
            };
        case "terminal":
            return snapshot.terminalCode === "update-required" ||
                snapshot.terminalCode === "incompatible-version"
                ? { status: "update-required", publishes: false }
                : { status: "offline", publishes: true };
        case "failed":
            switch (snapshot.failure) {
                case "unauthorized":
                    return { status: "authentication-required", publishes: false };
                case "fenced":
                    return { status: "connecting", publishes: false };
                default:
                    return { status: "offline", publishes: true };
            }
        case "closed":
            return { status: "closed", publishes: false };
    }
};
const resumed = (prior) => {
    if (prior === undefined || prior.status === "pending")
        return PENDING;
    return prior.stale ? prior : Object.freeze({ ...prior, stale: true });
};
class QueryObserver {
    lowered;
    lower;
    release;
    shape;
    store;
    scheduled = -1;
    plain;
    constructor(lowered, lower, release, shape, retired) {
        this.lowered = lowered;
        this.lower = lower;
        this.release = release;
        this.shape = shape;
        this.store = new Store(resumed(retired?.snapshot));
        this.plain = retired?.plain;
    }
    rows() {
        return this.plain;
    }
    republish(changed) {
        const prior = this.store.getSnapshot();
        if (prior.status !== "ready")
            return;
        if (!this.publishes(prior.data, changed))
            return;
        this.store.publish(Object.freeze({ ...prior }));
    }
    publishes(data, changed) {
        if (changed.size === 0)
            return false;
        const rows = Array.isArray(data)
            ? data
            : typeof data === "object" && data !== null &&
                Array.isArray(data.rows)
                ? data.rows
                : [data];
        return rows.some((row) => changed.has(row));
    }
    subscribe(onChange) {
        const stop = this.store.subscribe(onChange);
        let released = false;
        return () => {
            if (released)
                return;
            released = true;
            stop();
            if (this.store.size === 0)
                this.release(this);
        };
    }
    async run(generation, view, stale) {
        if (generation < this.scheduled)
            return;
        this.scheduled = generation;
        if (view === undefined) {
            this.publish(generation, "pending", undefined, true, undefined);
            return;
        }
        try {
            const lowered = this.lowered.bindsEntities ? this.lower() : this.lowered;
            const rows = lowered.finalize(await runQuery(view, lowered.query));
            if (rows instanceof NotOne) {
                this.publish(generation, "error", undefined, stale, rows);
                return;
            }
            this.publish(generation, "ready", rows, stale, undefined);
        }
        catch (cause) {
            this.publish(generation, "error", undefined, stale, cause instanceof Error ? cause : new Error(String(cause)));
        }
    }
    publish(generation, status, rows, stale, error) {
        if (generation < this.scheduled)
            return;
        const prior = this.store.getSnapshot();
        const unchangedData = sameResult(this.plain, rows);
        if (prior.status === status && prior.stale === stale &&
            prior.error === error && unchangedData)
            return;
        const data = status !== "ready"
            ? undefined
            : unchangedData
                ? prior.data
                : this.shape(rows);
        this.plain = rows;
        this.store.publish(Object.freeze({ status, data, stale, error }));
    }
}
class ActivationFailed extends Error {
    status;
    constructor(status, cause) {
        super("ramose/client: activation failed", { cause });
        this.status = status;
    }
}
const activationStep = async (status, run) => {
    try {
        return await run();
    }
    catch (cause) {
        throw new ActivationFailed(status, cause);
    }
};
export class ClientDatabaseHandle {
    context;
    query = { from: clientQueryFrom(this) };
    mutations;
    get mutate() {
        this.mutations ??= mutationNamespace(this.context.mutations, this, this.context.mutations.databaseOperations());
        return this.mutations;
    }
    syncStore = new Store(syncState("idle"));
    sync = this.syncStore.subscription;
    binding = Object.freeze({
        subscribe: () => () => undefined,
        getSnapshot: () => this,
    });
    graphChildren = new Map();
    observers = new Map();
    retired = new Map();
    activation;
    opening;
    settling = new Set();
    catalog;
    session;
    releaseSession;
    reconciler;
    reconcilerKey;
    reconcilerPending;
    releaseOverlay;
    identity;
    committed;
    account;
    handles = new Map();
    reverse;
    speculative = new Map();
    registry;
    viewValue;
    viewGeneration = 0;
    lastSession;
    stale = true;
    updateRequired = false;
    queueUpdateRequired = false;
    closed = false;
    refused = false;
    wakePending = false;
    awaitedRoute = false;
    generation = 0;
    constructor(context) {
        this.context = context;
    }
    spawn(work) {
        const settled = work.then(() => undefined, () => undefined);
        this.settling.add(settled);
        void settled.then(() => this.settling.delete(settled));
    }
    async drain() {
        while (this.settling.size > 0) {
            await Promise.all([...this.settling]);
        }
    }
    observe(query) {
        this.context.assertLive("observe");
        const value = query;
        const lower = () => lowerQueryObject(value, {
            entity: (eid) => this.entityId(eid),
            resolveEntity: (id) => typeof id === "string" ? this.localIdOf(id) : undefined,
        });
        const lowered = lower();
        const key = queryObservationKey(value);
        const shape = this.shapeRows(entityFocusOf(query), lowered);
        void this.activate();
        let last = this.observers.get(key);
        return Object.freeze({
            subscribe: (onChange) => {
                const observer = this.acquire(key, lowered, lower, shape);
                last = observer;
                return observer.subscribe(onChange);
            },
            getSnapshot: () => {
                if (this.closed)
                    return PENDING;
                const observer = this.observers.get(key);
                if (observer !== undefined)
                    last = observer;
                return (last?.store.getSnapshot() ?? this.retired.get(key)?.snapshot ??
                    PENDING);
            },
        });
    }
    shapeRows(focus, lowered) {
        if (focus === undefined)
            return (rows) => rows;
        const wrap = (row) => {
            const id = rowIdentity(row);
            return id === undefined
                ? row
                : this.entities().handle(id, focus, lowered.rowShape, row);
        };
        switch (lowered.result) {
            case "page":
                return (value) => {
                    const page = value;
                    return { ...page, rows: page.rows.map(wrap) };
                };
            case "row":
                return (value) => (value === null ? null : wrap(value));
            case "rows":
                return (value) => (Array.isArray(value) ? value.map(wrap) : value);
        }
    }
    entities() {
        if (this.registry !== undefined)
            return this.registry;
        this.registry = new EntityRegistry(this.context.mutations, this, (focus) => this.context.mutations.selfOperations({
            kind: focus._tag === "Trait" ? "trait" : "entity",
            name: focus.ns,
        }));
        const mappings = this.reconciler?.mappings();
        if (mappings !== undefined) {
            for (const [ref, id] of mappings)
                this.registry.alias(ref, id);
        }
        const pending = this.reconciler?.snapshot().pending;
        if (pending !== undefined)
            this.registry.observe(pending);
        return this.registry;
    }
    republishLocal(changed) {
        for (const observer of this.observers.values())
            observer.republish(changed);
    }
    acquire(key, lowered, lower, shape) {
        const existing = this.observers.get(key);
        if (existing !== undefined)
            return existing;
        const retired = this.retired.get(key);
        this.retired.delete(key);
        const observer = new QueryObserver(lowered, lower, (self) => {
            if (this.observers.get(key) !== self)
                return;
            this.observers.delete(key);
            this.retired.set(key, {
                snapshot: resumed(self.store.getSnapshot()),
                plain: self.rows(),
            });
        }, shape, retired);
        if (this.closed)
            return observer;
        this.observers.set(key, observer);
        this.spawn(observer.run(this.viewGeneration, this.viewValue, this.stale));
        return observer;
    }
    boundReconciler() {
        return this.reconciler;
    }
    authenticatedBy(credential) {
        return this.account !== undefined && this.account === credential.cacheKey;
    }
    graphPath() {
        return this.context.graphPath;
    }
    activateGraph() {
        void this.activate();
    }
    boundDatabase() {
        return this.closed ? undefined : this;
    }
    bindingFailure() {
        return undefined;
    }
    graphChild(key, canonical) {
        const existing = this.graphChildren.get(key);
        if (existing !== undefined)
            return existing;
        const child = new GraphDatabaseHandle(this, canonical, this.context.graph(), (operation) => this.context.assertLive(operation), this.context.mutations);
        this.graphChildren.set(key, child);
        return child;
    }
    activate() {
        if (this.activation !== undefined)
            return this.activation;
        const opening = this.open().catch((cause) => {
            if (isReplicaFenceError(cause)) {
                this.activation = undefined;
                this.refused = true;
                this.publishStatus("offline");
                return;
            }
            const terminal = cause instanceof ActivationFailed ? cause.status : undefined;
            if (terminal === undefined) {
                this.publishStatus("offline");
                return;
            }
            this.activation = undefined;
            this.refused = true;
            this.publishStatus(terminal);
        });
        this.activation = opening;
        this.opening = opening;
        void opening.then(() => {
            if (this.opening !== opening)
                return;
            this.opening = undefined;
            this.answerWake();
        });
        return this.activation;
    }
    restart() {
        if (this.opening !== undefined)
            return this.opening;
        this.activation = undefined;
        return this.activate();
    }
    reactivateRefused() {
        if (!this.live() || !this.refused)
            return;
        if (this.session === undefined && this.activation !== undefined)
            return;
        this.refused = false;
        this.releaseSession?.();
        this.releaseSession = undefined;
        const session = this.session;
        this.session = undefined;
        this.activation = undefined;
        if (session !== undefined)
            this.spawn(session.close());
        void this.activate();
    }
    disposition() {
        const snapshot = this.session?.snapshot();
        return snapshot === undefined
            ? this.syncStatus()
            : readSessionSnapshot(snapshot).status;
    }
    reactivateOffline() {
        if (!this.live() || this.refused)
            return;
        if (this.opening !== undefined || this.disposition() !== "offline") {
            this.wakePending = true;
            return;
        }
        this.wakePending = false;
        const session = this.session;
        this.releaseSession?.();
        this.releaseSession = undefined;
        this.session = undefined;
        if (session !== undefined)
            this.spawn(session.close());
        void this.restart();
    }
    answerWake() {
        if (!this.wakePending)
            return;
        if (!this.live()) {
            this.wakePending = false;
            return;
        }
        if (this.opening !== undefined)
            return;
        const disposition = this.disposition();
        if (disposition === "offline" && !this.refused) {
            this.reactivateOffline();
            return;
        }
        if (this.refused || disposition === "authentication-required" ||
            disposition === "update-required" || disposition === "closed")
            this.wakePending = false;
    }
    async open() {
        this.publishStatus(this.updateRequired || this.queueUpdateRequired
            ? "update-required"
            : this.committed === undefined
                ? "connecting"
                : "stale");
        if (this.committed !== undefined && !this.stale) {
            this.stale = true;
            this.spawn(this.recompute());
        }
        const [catalog, storage] = await activationStep("closed", () => Promise.all([this.context.catalog(), this.context.storage()]));
        if (!this.live())
            return;
        this.catalog = catalog;
        const credential = await activationStep("authentication-required", () => this.context.credential());
        if (!this.live())
            return;
        const lineage = this.context.graphLineage?.();
        this.account = credential.cacheKey;
        const session = await ReplicationSession.open({
            activation: {
                server: this.context.server,
                root: this.context.root,
                graphPath: this.context.graphPath,
            },
            credential: credential.token,
            cacheKey: credential.cacheKey,
            ...(lineage === undefined ? {} : { graphLineage: lineage }),
            attributes: catalog.attributes,
            readCompatibilityHash: catalog.readCompatibilityHash,
            storage,
            onActivationOutcome: () => this.settleActivation(),
        });
        if (!this.live()) {
            await session.close();
            return;
        }
        this.session = session;
        this.releaseSession = session.observe((snapshot) => this.accept(snapshot));
    }
    async refreshCommitted() {
        if (!this.live())
            return;
        await this.session?.refreshFromDurable().catch(() => false);
    }
    async refreshOptimistic() {
        if (!this.live())
            return;
        await this.reconciler?.refresh().catch(() => undefined);
    }
    reactivateUnconfirmed() {
        if (!this.live() || this.identity !== undefined)
            return;
        if (this.activation === undefined || this.context.graphPath.length === 0)
            return;
        const session = this.session;
        if (session === undefined) {
            this.awaitedRoute = true;
            return;
        }
        const status = session.snapshot().status;
        if (status !== "failed" && status !== "terminal" && status !== "closed")
            return;
        this.releaseSession?.();
        this.releaseSession = undefined;
        this.session = undefined;
        this.activation = undefined;
        this.spawn(session.close());
        void this.activate();
    }
    async reconcileSubmissions(progress) {
        const scope = this.confirmedScope();
        const mine = scope === undefined ? undefined : replicaDatabaseKey(scope);
        if (!this.queueUpdateRequired && mine !== undefined &&
            progress.some((entry) => entry.state._tag === "UpdateRequired" &&
                replicaDatabaseKey(entry.receiver) === mine)) {
            this.queueUpdateRequired = true;
            this.publishStatus("update-required");
        }
        const reconciler = this.reconciler;
        if (reconciler === undefined || !this.live())
            return;
        const session = this.session;
        await reconciler.reconcile(progress, session === undefined ? undefined : {
            close: async () => {
                this.releaseSession?.();
                this.releaseSession = undefined;
                this.session = undefined;
                await session.close();
            },
        });
        if (this.session === undefined && this.live())
            await this.restart();
    }
    live() {
        return !this.closed && this.context.live();
    }
    accept(snapshot) {
        if (this.closed)
            return;
        if (snapshot.status === "closed") {
            this.fence();
            this.context.onFenced();
            return;
        }
        if (snapshot.status === "failed" && snapshot.failure === "fenced") {
            this.refence();
            return;
        }
        const value = snapshot.value;
        const identity = value?.identity;
        if (identity !== undefined) {
            if (this.identity !== undefined &&
                !sameReplicationIdentity(this.identity, identity)) {
                this.transition();
            }
            this.identity = identity;
            this.context.onConfirmed(identity);
            this.context.mutations.submit(replicaDatabaseScopeOf(identity));
            this.spawn(this.bindReconciler(identity));
        }
        this.lastSession = snapshot;
        const disposition = readSessionSnapshot(snapshot);
        if (disposition.status === "authentication-required")
            this.refused = true;
        this.stale = value === undefined ? true : value.stale;
        const catalog = this.catalog;
        if (!disposition.publishes || value === undefined || catalog === undefined) {
            this.committed = undefined;
            this.forgetHandles();
        }
        else {
            this.committed = value.db.withComposition(catalog.composition);
            this.handles = value.handles;
            this.reverse = undefined;
        }
        this.publishStatus(this.statusOf(snapshot));
        this.spawn(this.recompute());
        this.retryAwaitedRoute();
        this.answerWake();
    }
    retryAwaitedRoute() {
        if (!this.awaitedRoute || this.identity !== undefined)
            return;
        const status = this.session?.snapshot().status;
        if (status !== "failed" && status !== "terminal" && status !== "closed")
            return;
        this.awaitedRoute = false;
        this.reactivateUnconfirmed();
    }
    fence() {
        this.closed = true;
        this.generation++;
        this.committed = undefined;
        this.forgetHandles();
        this.withdrawEntities();
        this.forgetCredential();
        this.viewValue = undefined;
        this.viewGeneration = this.generation;
        this.releaseOverlay?.();
        this.releaseOverlay = undefined;
        this.reconciler = undefined;
        this.reconcilerPending = undefined;
        this.reconcilerKey = undefined;
        for (const observer of this.observers.values()) {
            this.spawn(observer.run(this.generation, undefined, true));
        }
        this.observers.clear();
        this.retired.clear();
        this.closeGraphChildren();
        this.syncStore.publish(syncState("closed"));
    }
    closeGraphChildren() {
        for (const child of this.graphChildren.values())
            child.close();
        this.graphChildren.clear();
    }
    transition(status = "authentication-required") {
        this.generation++;
        this.committed = undefined;
        this.forgetHandles();
        this.withdrawEntities();
        this.forgetCredential();
        this.viewValue = undefined;
        this.viewGeneration = this.generation;
        this.reconciler = undefined;
        this.reconcilerKey = undefined;
        this.reconcilerPending = undefined;
        this.releaseOverlay?.();
        this.releaseOverlay = undefined;
        this.updateRequired = false;
        this.retired.clear();
        this.publishStatus(status);
        for (const observer of this.observers.values()) {
            this.spawn(observer.run(this.generation, undefined, true));
        }
    }
    refence() {
        this.releaseSession?.();
        this.releaseSession = undefined;
        const session = this.session;
        this.session = undefined;
        this.identity = undefined;
        this.lastSession = undefined;
        this.activation = undefined;
        this.transition("connecting");
        if (session !== undefined)
            this.spawn(session.close());
        if (this.live())
            void this.activate();
    }
    async revalidate() {
        if (!this.live())
            return;
        await this.session?.revalidate().catch(() => false);
    }
    statusOf(snapshot) {
        const status = readSessionSnapshot(snapshot).status;
        if (status === "authentication-required" || status === "closed")
            return status;
        return this.updateRequired || this.queueUpdateRequired
            ? "update-required"
            : status;
    }
    publishStatus(status) {
        if (this.closed && status !== "closed")
            return;
        if (this.syncStore.publish(syncState(status)))
            this.context.onSyncChange();
    }
    syncStatus() {
        return this.syncStore.getSnapshot().status;
    }
    activated() {
        return this.activation !== undefined;
    }
    confirmedIdentity() {
        return this.identity;
    }
    viewWithdrawn() {
        if (this.closed)
            return true;
        return this.lastSession !== undefined &&
            !readSessionSnapshot(this.lastSession).publishes;
    }
    async recompute() {
        const generation = ++this.generation;
        const committed = this.committed;
        const reconciler = this.reconciler;
        const layers = reconciler?.snapshot().layers ?? emptyOverlayLayers;
        let view = committed;
        let speculative = new Map();
        if (committed !== undefined && reconciler !== undefined && layers.length > 0) {
            try {
                const overlay = await reconciler.view(committed);
                view = overlay.db;
                for (const [handle, local] of overlay.speculative) {
                    speculative.set(local, handle);
                }
            }
            catch {
                view = committed;
                speculative = new Map();
            }
        }
        if (generation !== this.generation || this.closed)
            return;
        this.viewValue = view;
        this.speculative = speculative;
        this.viewGeneration = generation;
        const stale = this.stale;
        for (const observer of this.observers.values()) {
            this.spawn(observer.run(generation, view, stale));
        }
    }
    bindReconciler(identity) {
        const receiver = replicaDatabaseScopeOf(identity);
        const key = replicaDatabaseKey(receiver);
        if (this.reconcilerKey === key && this.reconcilerPending !== undefined) {
            return this.reconcilerPending;
        }
        this.reconcilerKey = key;
        const pending = (async () => {
            const storage = await this.context.storage();
            const catalog = await this.context.catalog();
            const reconciler = new OptimisticReconciler(storage.outbox(), receiver, catalog.projections, this.reconciliationOptions());
            await reconciler.refresh();
            if (this.reconcilerKey !== key || this.closed)
                return reconciler;
            this.releaseOverlay?.();
            this.reconciler = reconciler;
            this.releaseOverlay = reconciler.observe((state) => this.overlay(state));
            return reconciler;
        })().catch((cause) => {
            if (this.reconcilerPending === pending) {
                this.reconcilerKey = undefined;
                this.reconcilerPending = undefined;
            }
            throw cause;
        });
        this.reconcilerPending = pending;
        return pending;
    }
    reconciliationOptions() {
        return { entity: (id) => this.handles.get(id) };
    }
    forgetCredential() {
        this.account = undefined;
    }
    forgetHandles() {
        this.handles = new Map();
        this.reverse = undefined;
        this.speculative = new Map();
    }
    withdrawEntities() {
        this.registry?.clear();
        this.registry = undefined;
    }
    entityId(eid) {
        const handle = this.sealedHandleOf(eid);
        if (handle !== undefined)
            return handle;
        const speculative = this.speculative.get(eid);
        if (speculative !== undefined)
            return speculative;
        throw new Error("ramose/client: this row has no opaque identity in the current local value");
    }
    localIdOf(id) {
        const mapped = this.reconciler?.mappings().get(id);
        const committed = this.handles.get(mapped ?? id);
        if (committed !== undefined)
            return committed;
        for (const [local, handle] of this.speculative) {
            if (handle === id || (mapped !== undefined && handle === mapped)) {
                return local;
            }
        }
        return undefined;
    }
    sealedHandleOf(eid) {
        if (this.reverse === undefined) {
            const reverse = new Map();
            for (const [handle, local] of this.handles)
                reverse.set(local, handle);
            this.reverse = reverse;
        }
        return this.reverse.get(eid);
    }
    confirmedScope() {
        return this.identity === undefined
            ? undefined
            : replicaDatabaseScopeOf(this.identity);
    }
    overlay(state) {
        if (this.closed)
            return;
        const moved = this.registry?.observe(state.pending);
        if (moved !== undefined && moved.size > 0)
            this.republishLocal(moved);
        const mappings = this.reconciler?.mappings();
        if (mappings !== undefined) {
            for (const [ref, id] of mappings) {
                this.registry?.alias(ref, id);
            }
        }
        const required = state.updateRequired.length > 0;
        if (required !== this.updateRequired) {
            this.updateRequired = required;
            this.publishStatus(required
                ? "update-required"
                : this.statusOf(this.lastSession ?? { status: "connecting" }));
        }
        this.spawn(this.recompute());
    }
    async settleActivation() {
        const identity = this.session?.snapshot().value?.identity ?? this.identity;
        if (identity === undefined || this.closed)
            return;
        const reconciler = await this.bindReconciler(identity);
        await reconciler.outcome(reconciler.activation())();
    }
    async close() {
        if (this.closed) {
            await this.drain();
            return;
        }
        this.closed = true;
        this.generation++;
        this.releaseOverlay?.();
        this.releaseOverlay = undefined;
        this.releaseSession?.();
        this.releaseSession = undefined;
        this.reconciler = undefined;
        this.reconcilerPending = undefined;
        this.committed = undefined;
        this.forgetHandles();
        this.withdrawEntities();
        this.forgetCredential();
        this.viewValue = undefined;
        for (const observer of this.observers.values()) {
            this.spawn(observer.run(this.generation, undefined, true));
        }
        this.observers.clear();
        this.retired.clear();
        this.closeGraphChildren();
        this.syncStore.publish(syncState("closed"));
        const session = this.session;
        this.session = undefined;
        if (session !== undefined)
            await session.close();
        await this.activation?.catch(() => undefined);
        await this.drain();
    }
}
//# sourceMappingURL=database.js.map