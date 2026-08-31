export const satisfiesActivationFence = (frame) => {
    switch (frame) {
        case "Change":
        case "ResumeReady":
        case "SnapshotCommit":
            return true;
        case "Reset":
        case "SnapshotStart":
        case "SnapshotChunk":
        case "KeepAlive":
        case "TerminalError":
            return false;
    }
};
export const requiresActivationFence = (progress) => progress.state._tag === "Committed";
const EMPTY = Object.freeze([]);
export class ActivationFence {
    store;
    receiver;
    state;
    observers = new Set();
    settled = 0;
    constructor(store, receiver) {
        this.store = store;
        this.receiver = receiver;
        this.state = Object.freeze({
            receiver,
            activation: 0,
            unobserved: Object.freeze([]),
            fenced: EMPTY,
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
    async refresh() {
        return this.publish(await this.store.observationState(this.receiver), EMPTY);
    }
    async begin() {
        const activation = await this.store.beginActivation(this.receiver);
        await this.refresh();
        return activation;
    }
    async restart(prior) {
        await prior?.close();
        return this.begin();
    }
    async settle(activation) {
        if (activation <= this.settled)
            return undefined;
        const outcome = await this.store.fenceActivation(this.receiver, activation);
        this.settled = Math.max(this.settled, activation);
        this.publish(await this.store.observationState(this.receiver), outcome.fenced);
        return outcome;
    }
    outcome(activation) {
        return async () => {
            await this.settle(activation);
        };
    }
    publish(observation, fenced) {
        this.state = Object.freeze({
            receiver: this.receiver,
            activation: observation.activation,
            unobserved: observation.unobserved,
            fenced,
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
//# sourceMappingURL=activation-fence.js.map