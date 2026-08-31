import { Store } from "./subscription.js";
/**
 * Why the authoritative server refused an invocation it had.
 *
 * The code is the server's own opaque classification; it is reported so an
 * application can branch, never interpreted here.
 */
export class MutationRejectedError extends Error {
    _tag = "MutationRejectedError";
    code;
    constructor(code) {
        super(`ramose/client: the server rejected this invocation (${code})`);
        this.name = "MutationRejectedError";
        this.code = code;
    }
}
const PENDING = Object.freeze({ status: "pending" });
const QUEUED = Object.freeze({ status: "queued" });
const COMMITTED = Object.freeze({ status: "committed" });
export class ReceiptDriver {
    store = new Store(PENDING);
    settleQueued;
    failQueued;
    settleCommitted;
    failCommitted;
    receipt;
    constructor(invocation) {
        const queued = new Promise((resolve, reject) => {
            this.settleQueued = resolve;
            this.failQueued = reject;
        });
        const committed = new Promise((resolve, reject) => {
            this.settleCommitted = resolve;
            this.failCommitted = reject;
        });
        queued.catch(() => undefined);
        committed.catch(() => undefined);
        this.receipt = Object.freeze({
            invocation,
            queued,
            committed,
            subscribe: this.store.subscription.subscribe,
            getSnapshot: this.store.subscription.getSnapshot,
        });
    }
    get settled() {
        const status = this.store.getSnapshot().status;
        return status === "committed" || status === "rejected" || status === "failed";
    }
    queue() {
        if (this.settled || this.store.getSnapshot().status === "queued")
            return;
        this.store.publish(QUEUED);
        this.settleQueued();
    }
    commit() {
        if (this.settled)
            return;
        this.queue();
        this.store.publish(COMMITTED);
        this.settleCommitted();
    }
    reject(code) {
        if (this.settled)
            return;
        const error = new MutationRejectedError(code);
        this.queue();
        this.store.publish(Object.freeze({ status: "rejected", error }));
        this.failCommitted(error);
    }
    fail(error) {
        if (this.settled || this.store.getSnapshot().status === "queued")
            return;
        this.store.publish(Object.freeze({ status: "failed", error }));
        this.failQueued(error);
        this.failCommitted(error);
    }
}
//# sourceMappingURL=receipt.js.map