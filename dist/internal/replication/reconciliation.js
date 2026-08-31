import { runProjection, } from "../../db/Projection.js";
import { ActivationFence, requiresActivationFence, } from "./activation-fence.js";
import { emptyOverlayLayers, } from "./overlay-layers.js";
import { layerOf, restoreOverlayLayers, } from "./overlay-records.js";
import { projectOverlay, } from "./overlay.js";
export const pendingLayerState = (layers) => {
    const pending = new Map();
    for (const layer of layers) {
        for (const op of layer.changeset) {
            const refs = [op.entity];
            if ((op.op === "set" || op.op === "remove") && op.value?.type === "ref") {
                refs.push(op.value.value);
            }
            for (const ref of refs) {
                const entry = pending.get(ref) ??
                    { ref, invocations: [], queued: false, created: false };
                if (!entry.invocations.includes(layer.invocation)) {
                    entry.invocations.push(layer.invocation);
                }
                if (layer.state === "queued")
                    entry.queued = true;
                if (op.op === "create" && op.entity === ref)
                    entry.created = true;
                pending.set(ref, entry);
            }
        }
    }
    return new Map([...pending].map(([ref, entry]) => [
        ref,
        Object.freeze({
            ref: entry.ref,
            invocations: Object.freeze([...entry.invocations]),
            state: (entry.queued ? "queued" : "committed-unobserved"),
            created: entry.created,
        }),
    ]));
};
const NO_ENTITY = () => undefined;
const targetOf = (record) => {
    switch (record.target.type) {
        case "entity":
            return record.target.entityId;
        case "client-ref":
            return record.target.clientRef;
        case "none":
            return undefined;
    }
};
const replayLayer = (projection, record) => {
    const allocations = {};
    for (const allocation of record.allocations) {
        allocations[allocation.slot] = allocation.clientRef;
    }
    const outcome = runProjection(projection, {
        input: record.input,
        self: targetOf(record),
        allocations,
    });
    return outcome.type === "changeset"
        ? layerOf(record, outcome.changeset)
        : undefined;
};
export class OptimisticReconciler {
    store;
    receiver;
    catalog;
    options;
    fence;
    observers = new Set();
    state;
    handles = new Map();
    refreshing = Promise.resolve();
    constructor(store, receiver, catalog, options = {}) {
        this.store = store;
        this.receiver = receiver;
        this.catalog = catalog;
        this.options = options;
        this.fence = new ActivationFence(store, receiver);
        this.state = Object.freeze({
            receiver,
            layers: emptyOverlayLayers,
            updateRequired: Object.freeze([]),
            pending: new Map(),
            activation: 0,
        });
    }
    snapshot() {
        return this.state;
    }
    observe(observer) {
        this.observers.add(observer);
        this.notify(observer);
        return () => this.observers.delete(observer);
    }
    refresh() {
        const next = this.refreshing.then(() => this.readDurableLayers(), () => this.readDurableLayers());
        this.refreshing = next.then(() => undefined, () => undefined);
        return next;
    }
    async readDurableLayers() {
        const [rows, handles] = await Promise.all([
            this.store.optimisticLayers(this.receiver),
            this.store.mappedHandles(this.receiver),
        ]);
        this.handles = handles;
        await this.fence.refresh();
        return this.publish(rows);
    }
    async restart(prior) {
        const activation = await this.fence.restart(prior);
        await this.refresh();
        return activation;
    }
    outcome(activation) {
        return async () => {
            const outcome = await this.fence.settle(activation);
            if (outcome !== undefined)
                await this.applyFence(outcome);
        };
    }
    mappings() {
        return this.handles;
    }
    activation() {
        return this.fence.snapshot().activation;
    }
    async reconcile(progress, prior) {
        const mine = progress.filter((entry) => entry.receiver.server === this.receiver.server &&
            entry.receiver.principal === this.receiver.principal &&
            entry.receiver.database === this.receiver.database);
        if (mine.some(requiresActivationFence)) {
            await this.restart(prior);
            return;
        }
        if (mine.some((entry) => entry.state._tag === "Rejected")) {
            await this.refresh();
        }
    }
    resolver() {
        const handles = this.handles;
        return Object.freeze({
            entity: this.options.entity ?? NO_ENTITY,
            mapping: (ref) => handles.get(ref),
        });
    }
    view(committed) {
        return projectOverlay(committed, this.state.layers, this.resolver());
    }
    async applyFence(outcome) {
        this.handles = await this.store.mappedHandles(this.receiver)
            .catch(() => this.handles);
        this.publish({ layers: outcome.layers, unreadable: outcome.unreadable });
    }
    publish(rows) {
        const restoration = restoreOverlayLayers(rows, {
            catalog: this.catalog,
            keyId: this.options.keyId,
            run: replayLayer,
        });
        const layers = restoration.type === "layers"
            ? Object.freeze(restoration.layers)
            : emptyOverlayLayers;
        this.state = Object.freeze({
            receiver: this.receiver,
            layers,
            updateRequired: restoration.type === "layers"
                ? Object.freeze([])
                : restoration.quarantined,
            pending: pendingLayerState(layers),
            activation: this.fence.snapshot().activation,
        });
        for (const observer of this.observers)
            this.notify(observer);
        return this.state;
    }
    notify(observer) {
        try {
            observer(this.state);
        }
        catch {
        }
    }
}
//# sourceMappingURL=reconciliation.js.map