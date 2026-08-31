import { COMPOSED_TRAITS } from "../db/Composer.js";
import { isClientRef, isEntityId, } from "../db/refs.js";
import { NotOne } from "../db/Errors.js";
import { Graph } from "../db/Graph.js";
import { select as selectStage } from "../db/query/lib.js";
import { from as queryFrom, q, } from "../db/query/index.js";
import { replicaDatabaseKey, replicaDatabaseScopeOf, } from "../internal/replication/replica-lifecycle.js";
import { ClientDatabaseHandle, queryObservationKey, } from "./database.js";
import { GraphPathError, GraphReceiverError } from "./errors.js";
import { mutationNamespace } from "./mutation.js";
import { Store } from "./subscription.js";
import { syncState } from "./sync.js";
const composesGraph = (ns) => {
    const composed = ns[COMPOSED_TRAITS];
    if (composed?.["graph"] === true)
        return true;
    return ns._tag === "Trait" && ns.ns === "graph";
};
const CURSOR_STAGES = new Set(["orderBy", "limit", "offset"]);
export const graphResolutionQuery = (logic, ns) => {
    const shape = { id: ns.id, name: Graph.name };
    const body = () => {
        const pipe = logic.body();
        return selectStage(shape)({
            ...pipe,
            stages: pipe.stages.filter((stage) => !CURSOR_STAGES.has(stage.kind)),
        });
    };
    return q(body).oneOrFail();
};
export const graphStableKey = (scope, entity) => `${replicaDatabaseKey(scope)} ${entity}`;
export const receiverStableKey = (receiver) => `receiver ${replicaDatabaseKey(receiver)}`;
const segmentIdentity = (row) => {
    if (row === null || typeof row !== "object")
        return undefined;
    const id = row.id;
    return typeof id === "object" && id !== null ? id.id : id;
};
const resolvedSegment = (row) => {
    if (row === null || typeof row !== "object")
        return undefined;
    const { name } = row;
    const handle = segmentIdentity(row);
    if (!isEntityId(handle) || typeof name !== "string")
        return undefined;
    return { id: handle, name };
};
const CHAIN = ["where", "orderBy", "limit", "offset", "ids", "after"];
export const ENTITY_FOCUS = Symbol.for("ramose/client/entity-focus");
export const entityFocusOf = (query) => {
    if (query === null || typeof query !== "object")
        return undefined;
    const focus = query[ENTITY_FOCUS];
    return focus === undefined ? undefined : focus;
};
const decorate = (fluent, logic, ns, node) => {
    const wrapped = { ...fluent };
    wrapped[ENTITY_FOCUS] = ns;
    for (const key of CHAIN) {
        const method = fluent[key];
        if (typeof method !== "function")
            continue;
        wrapped[key] = (...args) => decorate(method.apply(fluent, args), key === "where"
            ? logic["where"].apply(logic, args)
            : logic, ns, node);
    }
    for (const key of ["one", "oneOrFail"]) {
        wrapped[key] = () => {
            const taken = fluent[key]
                .call(fluent);
            if (!composesGraph(ns)) {
                return Object.assign({ [ENTITY_FOCUS]: ns }, taken);
            }
            return Object.assign({ [ENTITY_FOCUS]: ns }, taken, {
                db: () => {
                    const canonical = graphResolutionQuery(logic, ns);
                    return node.graphChild(queryObservationKey(canonical), canonical);
                },
            });
        };
    }
    return wrapped;
};
export const clientQueryFrom = (node) => (entity) => {
    const base = queryFrom(entity);
    return decorate(base, base, entity, node);
};
const samePath = (left, right) => left.length === right.length &&
    left.every((segment, index) => segment === right[index]);
export class GraphRegistry {
    factory;
    membershipChanged;
    databases = new Map();
    lineages = new Map();
    closing = new Set();
    constructor(factory, membershipChanged) {
        this.factory = factory;
        this.membershipChanged = membershipChanged;
    }
    release(handle) {
        const settled = handle.close().catch(() => undefined);
        this.closing.add(settled);
        void settled.then(() => this.closing.delete(settled));
    }
    acquire(stable, graphPath, holder) {
        const existing = this.databases.get(stable);
        if (existing !== undefined) {
            if (samePath(existing.path, graphPath)) {
                existing.holders.add(holder);
                return existing.handle;
            }
            this.databases.delete(stable);
            this.release(existing.handle);
        }
        const handle = this.factory({
            graphPath,
            graphLineage: () => {
                const lineage = this.lineages.get(stable);
                return lineage?.length === graphPath.length ? lineage : undefined;
            },
            onConfirmed: (identity) => {
                if (identity.graphLineage.length === graphPath.length) {
                    this.lineages.set(stable, identity.graphLineage);
                }
            },
        });
        this.databases.set(stable, {
            path: graphPath,
            handle,
            holders: new Set([holder]),
        });
        this.membershipChanged();
        return handle;
    }
    retire(stable, holder) {
        const existing = this.databases.get(stable);
        if (existing === undefined)
            return;
        existing.holders.delete(holder);
        if (existing.holders.size > 0)
            return;
        this.databases.delete(stable);
        this.lineages.delete(stable);
        this.release(existing.handle);
        this.membershipChanged();
    }
    handles() {
        return [...this.databases.values()].map(({ handle }) => handle);
    }
    async close() {
        const handles = [...this.databases.values()].map(({ handle }) => handle);
        this.databases.clear();
        this.lineages.clear();
        for (const handle of handles)
            this.release(handle);
        while (this.closing.size > 0)
            await Promise.all([...this.closing]);
    }
}
const PENDING_BINDING = Object.freeze({ status: "pending" });
const PENDING_SNAPSHOT = Object.freeze({
    status: "pending",
    data: undefined,
    stale: true,
    error: undefined,
});
const unavailable = () => new GraphPathError({
    reason: "unavailable",
    message: "this graph path does not name a database you can read",
});
export const terminalPathError = (status) => {
    switch (status) {
        case "authentication-required":
            return new GraphPathError({
                reason: "unauthorized",
                message: "an ancestor of this graph path is no longer authorized",
            });
        case "update-required":
            return new GraphPathError({
                reason: "update-required",
                message: "this build cannot read the authorized view of an ancestor",
            });
        case "closed":
            return new GraphPathError({
                reason: "closed",
                message: "an ancestor of this graph path was closed",
            });
        default:
            return undefined;
    }
};
const failureStatus = (error) => {
    if (!(error instanceof GraphPathError))
        return "idle";
    switch (error.reason) {
        case "unauthorized":
            return "authentication-required";
        case "update-required":
            return "update-required";
        case "closed":
            return "closed";
        default:
            return "idle";
    }
};
export class GraphDatabaseHandle {
    parent;
    canonical;
    registry;
    assertLive;
    mutationContext;
    query = { from: clientQueryFrom(this) };
    mutations;
    bindingStore = new Store(PENDING_BINDING);
    binding = this.bindingStore.subscription;
    syncStore = new Store(syncState("idle"));
    sync = this.syncStore.subscription;
    children = new Map();
    activated = false;
    closed = false;
    releaseParent;
    releaseResolution;
    releaseParentSync;
    resolution;
    failureSnapshot;
    boundKey;
    releaseBoundSync;
    constructor(parent, canonical, registry, assertLive, mutationContext) {
        this.parent = parent;
        this.canonical = canonical;
        this.registry = registry;
        this.assertLive = assertLive;
        this.mutationContext = mutationContext;
    }
    activateGraph() {
        if (this.activated || this.closed)
            return;
        this.activated = true;
        this.parent.activateGraph();
        this.releaseParent = this.parent.binding.subscribe(() => this.reattach());
        this.reattach();
    }
    boundDatabase() {
        const binding = this.bindingStore.getSnapshot();
        return binding.status === "bound" ? binding.db : undefined;
    }
    bindingFailure() {
        const binding = this.bindingStore.getSnapshot();
        return binding.status === "failed" ? binding.error : undefined;
    }
    graphChild(key, canonical) {
        const existing = this.children.get(key);
        if (existing !== undefined)
            return existing;
        const child = new GraphDatabaseHandle(this, canonical, this.registry, this.assertLive, this.mutationContext);
        this.children.set(key, child);
        return child;
    }
    get mutate() {
        this.mutations ??= mutationNamespace(this.mutationContext, this, this.mutationContext.databaseOperations());
        return this.mutations;
    }
    observe(query) {
        this.assertLive("observe");
        this.activateGraph();
        let inner;
        let innerFor;
        const attached = () => {
            const bound = this.boundDatabase();
            if (bound === undefined) {
                inner = undefined;
                innerFor = undefined;
                return undefined;
            }
            if (innerFor !== bound) {
                inner = bound.observe(query);
                innerFor = bound;
            }
            return inner;
        };
        return Object.freeze({
            subscribe: (onChange) => {
                let releaseInner;
                const rebind = () => {
                    releaseInner?.();
                    releaseInner = attached()?.subscribe(onChange);
                };
                const releaseBinding = this.bindingStore.subscribe(() => {
                    rebind();
                    onChange();
                });
                rebind();
                let released = false;
                return () => {
                    if (released)
                        return;
                    released = true;
                    releaseBinding();
                    releaseInner?.();
                };
            },
            getSnapshot: () => {
                const observation = attached();
                if (observation !== undefined)
                    return observation.getSnapshot();
                return this.unboundSnapshot();
            },
        });
    }
    unboundSnapshot() {
        const failure = this.bindingFailure();
        if (failure === undefined)
            return PENDING_SNAPSHOT;
        if (this.failureSnapshot?.error !== failure) {
            this.failureSnapshot = Object.freeze({
                status: "error",
                data: undefined,
                stale: true,
                error: failure,
            });
        }
        return this.failureSnapshot;
    }
    reattach() {
        if (this.closed)
            return;
        this.releaseResolution?.();
        this.releaseResolution = undefined;
        this.releaseParentSync?.();
        this.releaseParentSync = undefined;
        this.resolution = undefined;
        const failure = this.parent.bindingFailure();
        if (failure !== undefined) {
            this.fail(failure);
            return;
        }
        const parent = this.parent.boundDatabase();
        if (parent === undefined) {
            this.publish(PENDING_BINDING, syncState("connecting"));
            return;
        }
        const resolution = parent.observe(this.canonical);
        this.resolution = resolution;
        this.releaseResolution = resolution.subscribe(() => this.settle(parent));
        this.releaseParentSync = parent.sync.subscribe(() => this.settle(parent));
        this.settle(parent);
    }
    ancestorFence(parent) {
        const status = parent.syncStatus();
        if (status === "authentication-required" || status === "closed") {
            return terminalPathError(status);
        }
        return parent.viewWithdrawn() ? terminalPathError(status) : undefined;
    }
    settle(parent) {
        if (this.closed)
            return;
        if (this.parent.boundDatabase() !== parent)
            return;
        const resolution = this.resolution;
        if (resolution === undefined)
            return;
        const fenced = this.ancestorFence(parent);
        if (fenced !== undefined) {
            this.fail(fenced);
            return;
        }
        const snapshot = resolution.getSnapshot();
        if (snapshot.status === "error") {
            const error = snapshot.error;
            if (error instanceof NotOne) {
                this.fail(error.found === 2
                    ? new GraphPathError({
                        reason: "ambiguous",
                        message: "this graph path matches more than one entity",
                    })
                    : unavailable());
                return;
            }
            this.fail(new GraphPathError({
                reason: "query",
                message: "this graph path could not be resolved against its parent",
                cause: error,
            }));
            return;
        }
        if (snapshot.status === "pending") {
            this.publish(PENDING_BINDING, syncState(parent.syncStatus()));
            return;
        }
        const segment = resolvedSegment(snapshot.data);
        if (segment === undefined) {
            if (isClientRef(segmentIdentity(snapshot.data))) {
                this.publish(PENDING_BINDING, syncState(parent.syncStatus()));
                return;
            }
            this.fail(unavailable());
            return;
        }
        const scope = parent.confirmedScope();
        if (scope === undefined) {
            this.publish(PENDING_BINDING, syncState(parent.syncStatus()));
            return;
        }
        const stable = graphStableKey(scope, segment.id);
        const handle = this.registry.acquire(stable, [...parent.graphPath(), segment.name], this);
        this.bind(stable, handle);
    }
    bind(stable, handle) {
        if (this.boundDatabase() === handle) {
            this.syncStore.publish(syncState(handle.syncStatus()));
            return;
        }
        if (this.boundKey !== undefined && this.boundKey !== stable) {
            this.registry.retire(this.boundKey, this);
        }
        this.releaseBoundSync?.();
        this.failureSnapshot = undefined;
        this.boundKey = stable;
        this.bindingStore.publish({ status: "bound", db: handle });
        this.syncStore.publish(syncState(handle.syncStatus()));
        this.releaseBoundSync = handle.sync.subscribe(() => {
            if (this.boundDatabase() === handle) {
                this.syncStore.publish(syncState(handle.syncStatus()));
            }
        });
    }
    fail(error) {
        const current = this.bindingStore.getSnapshot();
        if (current.status === "failed" && sameFailure(current.error, error))
            return;
        this.publish({ status: "failed", error }, syncState(failureStatus(error)));
    }
    publish(binding, status) {
        if (binding.status !== "bound" && this.boundKey !== undefined) {
            const retired = this.boundKey;
            this.boundKey = undefined;
            this.releaseBoundSync?.();
            this.releaseBoundSync = undefined;
            this.registry.retire(retired, this);
        }
        this.bindingStore.publish(binding);
        this.syncStore.publish(status);
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        this.releaseParent?.();
        this.releaseResolution?.();
        this.releaseParentSync?.();
        this.releaseParent = undefined;
        this.releaseResolution = undefined;
        this.releaseParentSync = undefined;
        this.releaseBoundSync?.();
        this.releaseBoundSync = undefined;
        if (this.boundKey !== undefined) {
            this.registry.retire(this.boundKey, this);
            this.boundKey = undefined;
        }
        this.resolution = undefined;
        for (const child of this.children.values())
            child.close();
        this.children.clear();
        this.bindingStore.publish({
            status: "failed",
            error: terminalPathError("closed") ?? unavailable(),
        });
        this.syncStore.publish(syncState("closed"));
    }
}
const sameFailure = (left, right) => {
    if (left === right)
        return true;
    const tag = (error) => error._tag;
    return tag(left) === tag(right) &&
        left.reason === right.reason;
};
export const resolveGraphReceiver = (database) => {
    if (database instanceof ClientDatabaseHandle)
        return confirmedReceiver(database);
    if (!(database instanceof GraphDatabaseHandle)) {
        return Promise.reject(new GraphReceiverError({
            reason: "unresolved",
            message: "this receiver is not a database this client opened",
        }));
    }
    const handle = database;
    handle.activateGraph();
    return settleOn(handle.binding, (resolve, reject) => {
        const failure = handle.bindingFailure();
        if (failure !== undefined) {
            reject(preQueueFailure(failure));
            return true;
        }
        const bound = handle.boundDatabase();
        if (bound === undefined)
            return false;
        confirmedReceiver(bound).then(resolve, reject);
        return true;
    });
};
const settleOn = (source, attempt) => new Promise((resolve, reject) => {
    let stop;
    let done = false;
    const settle = () => {
        if (done)
            return;
        done = attempt(resolve, reject);
        if (done)
            stop?.();
    };
    settle();
    if (done)
        return;
    stop = source.subscribe(settle);
    if (done)
        stop();
});
const PRE_QUEUE_REASON = {
    ambiguous: "ambiguous",
    closed: "closed",
    unauthorized: "unauthorized",
    "update-required": "update-required",
};
const preQueueFailure = (error) => new GraphReceiverError({
    reason: (error instanceof GraphPathError
        ? PRE_QUEUE_REASON[error.reason]
        : undefined) ?? "unresolved",
    message: "a graph receiver must resolve to one database before queueing",
    cause: error,
});
export const fencedReceiver = (status) => {
    switch (status) {
        case "authentication-required":
            return new GraphReceiverError({
                reason: "unauthorized",
                message: "this database's credential no longer opens it",
            });
        case "update-required":
            return new GraphReceiverError({
                reason: "update-required",
                message: "this build cannot read or replay against this database",
            });
        case "closed":
            return new GraphReceiverError({
                reason: "closed",
                message: "this database was closed before its receiver was known",
            });
        default:
            return undefined;
    }
};
const confirmedReceiver = (handle) => {
    void handle.activate();
    return settleOn(handle.sync, (resolve, reject) => {
        const fenced = fencedReceiver(handle.syncStatus());
        if (fenced !== undefined) {
            reject(fenced);
            return true;
        }
        const identity = handle.confirmedIdentity();
        if (identity === undefined)
            return false;
        resolve(replicaDatabaseScopeOf(identity));
        return true;
    });
};
//# sourceMappingURL=graph.js.map