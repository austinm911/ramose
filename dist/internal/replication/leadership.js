import { replicaDatabaseKey } from "./replica-lifecycle.js";
export const REPLICA_LEADERSHIP_KEY_VERSION = 1;
const LEADERSHIP_KEY_PREFIX = `ramose-replica-leader-v${REPLICA_LEADERSHIP_KEY_VERSION}:`;
export const replicaLeaderKey = (scope, storage) => `${LEADERSHIP_KEY_PREFIX}${encodeURIComponent(storage)}:${replicaDatabaseKey(scope)}`;
export const isLeadershipKey = (key) => key.startsWith(LEADERSHIP_KEY_PREFIX);
const ELECTION_RETRY_MS = 1_000;
export const platformLocks = () => globalThis
    .navigator?.locks;
export class SyncLeadership {
    options;
    state = "waiting";
    epoch;
    held;
    granted = Promise.resolve();
    queued = new AbortController();
    standing;
    constructor(options) {
        this.options = options;
    }
    static begin(options) {
        const leadership = new SyncLeadership(options);
        leadership.elect();
        return leadership;
    }
    status() {
        return this.state;
    }
    submits() {
        return this.state === "leading" || this.state === "unelected";
    }
    fence() {
        return this.state === "leading" && this.epoch !== undefined
            ? Object.freeze({ key: this.options.name, epoch: this.epoch })
            : undefined;
    }
    elect() {
        const locks = this.options.locks;
        if (locks === undefined) {
            this.state = "unelected";
            queueMicrotask(() => {
                if (this.state === "unelected")
                    this.options.onLeading();
            });
            return;
        }
        this.granted = locks
            .request(this.options.name, { signal: this.queued.signal }, () => this.lead())
            .catch(() => undefined);
    }
    stand() {
        if (this.state !== "waiting" || this.standing !== undefined)
            return;
        this.standing = setTimeout(() => {
            this.standing = undefined;
            if (this.state === "waiting")
                this.elect();
        }, ELECTION_RETRY_MS);
    }
    async lead() {
        if (this.state !== "waiting")
            return;
        let epoch;
        try {
            epoch = await this.options.claim();
        }
        catch {
            this.stand();
            return;
        }
        if (this.state !== "waiting")
            return;
        const hold = new Promise((resolve) => {
            this.held = resolve;
        });
        this.epoch = epoch;
        this.state = "leading";
        this.options.onLeading();
        await hold;
    }
    async standDown() {
        if (this.state !== "leading")
            return;
        this.state = "waiting";
        this.epoch = undefined;
        const release = this.held;
        this.held = undefined;
        release?.();
        await this.granted;
        if (this.state === "waiting")
            this.elect();
    }
    async release() {
        if (this.state === "released")
            return;
        const leading = this.state === "leading";
        this.state = "released";
        this.epoch = undefined;
        if (this.standing !== undefined)
            clearTimeout(this.standing);
        this.standing = undefined;
        if (leading)
            this.held?.();
        else
            this.queued.abort();
        await this.granted;
    }
}
//# sourceMappingURL=leadership.js.map