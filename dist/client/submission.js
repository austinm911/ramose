import { replicaDatabaseKey, } from "../internal/replication/replica-lifecycle.js";
import { runSubmissionPass, } from "../internal/replication/submission.js";
import { submitMutation } from "../internal/replication/transport.js";
const advanced = (entry) => entry.state._tag === "Committed" || entry.state._tag === "Rejected";
const fenced = (entry, reason) => entry.state._tag === "Interrupted" && entry.state.reason === reason;
const transient = (entry) => entry.state._tag === "Retry" ||
    (entry.state._tag === "Interrupted" &&
        entry.state.reason !== "scope-fenced" &&
        entry.state.reason !== "leadership-fenced");
export const passOutcome = (progress) => {
    if (progress.some((entry) => fenced(entry, "scope-fenced")))
        return "withdraw";
    if (progress.some((entry) => fenced(entry, "leadership-fenced"))) {
        return "stand-down";
    }
    if (progress.some(advanced))
        return "again";
    return progress.some(transient) ? "later" : "settled";
};
const RETRY_DELAY_MS = 1_000;
const scopeKey = (scope) => `${scope.server} ${scope.principal}`;
export class SubmissionLoop {
    context;
    receipts = new Map();
    pending = new Map();
    again = new Set();
    retries = new Map();
    inflight = new AbortController();
    constructor(context) {
        this.context = context;
    }
    track(receiver, driver) {
        this.receipts.set(driver.receipt.invocation, { receiver, driver });
    }
    async settleFromDurable() {
        if (this.receipts.size === 0 || !this.context.live())
            return;
        const outbox = (await this.context.storage()).outbox();
        for (const [invocation, tracked] of [...this.receipts]) {
            const record = await outbox.receipt(tracked.receiver, invocation)
                .catch(() => undefined);
            if (record === undefined || record.state === "queued")
                continue;
            this.receipts.delete(invocation);
            if (record.state === "committed")
                tracked.driver.commit();
            else
                tracked.driver.reject(record.failure?.code ?? "rejected");
        }
    }
    request(scope) {
        const key = scopeKey(scope);
        if (this.pending.has(key)) {
            this.again.add(key);
            return;
        }
        const run = this.pass(scope)
            .catch(() => this.later(scope))
            .finally(() => {
            this.pending.delete(key);
            if (this.again.delete(key))
                this.request(scope);
        });
        this.pending.set(key, run);
    }
    async settled() {
        while (this.pending.size > 0) {
            await Promise.all([...this.pending.values()]);
        }
    }
    async pass(scope) {
        if (!this.context.live())
            return;
        const leadership = this.context.leadership();
        if (leadership === undefined || !leadership.submits())
            return;
        const storage = await this.context.storage();
        const credential = await this.context.credential();
        if (!this.context.live() || !leadership.submits())
            return;
        const fence = leadership.fence();
        const progress = await runSubmissionPass({
            store: storage.outbox(() => fence),
            scope,
            endpoints: (receiver) => this.context.endpoint(receiver, credential),
            transport: submitMutation,
            signal: this.inflight.signal,
        });
        for (const entry of progress) {
            if (entry.state._tag === "Offline")
                this.context.resolve(entry.receiver);
            else if (entry.state._tag === "Empty")
                this.context.retire(entry.receiver);
        }
        await this.settle(progress);
        switch (passOutcome(progress)) {
            case "withdraw":
                await this.context.revalidate();
                return;
            case "stand-down":
                await leadership.standDown();
                return;
            case "again":
                this.request(scope);
                return;
            case "later":
                this.later(scope);
                return;
            case "settled":
                return;
        }
    }
    later(scope) {
        const key = scopeKey(scope);
        if (this.retries.has(key))
            return;
        this.retries.set(key, setTimeout(() => {
            this.retries.delete(key);
            if (this.context.live())
                this.request(scope);
        }, RETRY_DELAY_MS));
    }
    close() {
        for (const timer of this.retries.values())
            clearTimeout(timer);
        this.retries.clear();
        this.inflight.abort();
    }
    async settle(progress) {
        for (const entry of progress) {
            const state = entry.state;
            if (state._tag === "Committed") {
                this.receipts.get(state.invocation)?.driver.commit();
                this.receipts.delete(state.invocation);
            }
            else if (state._tag === "Rejected") {
                this.receipts.get(state.invocation)?.driver.reject(state.code);
                this.receipts.delete(state.invocation);
            }
        }
        const byReceiver = new Map();
        for (const entry of progress) {
            byReceiver.set(replicaDatabaseKey(entry.receiver), entry.receiver);
        }
        for (const receiver of byReceiver.values()) {
            await this.context.reconcile(receiver, progress).catch(() => undefined);
        }
    }
}
//# sourceMappingURL=submission.js.map