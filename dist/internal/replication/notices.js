import { replicaDatabaseKey, replicaDatabaseScopeOf, replicaScopeKey, replicaScopeOf, } from "./replica-lifecycle.js";
export const REPLICA_NOTICE_CHANNEL_VERSION = 1;
const NOTICE_CHANNEL_PREFIX = `ramose-replica-notice-v${REPLICA_NOTICE_CHANNEL_VERSION}:`;
export const replicaNoticeChannelName = (storage) => `${NOTICE_CHANNEL_PREFIX}${encodeURIComponent(storage)}`;
const NOTICE_KINDS = new Set([
    "replica",
    "layer",
    "receipt",
    "fence",
    "reset",
    "selector",
]);
export const replicaNotice = (kind, scope, database) => Object.freeze({
    kind,
    scope: replicaScopeKey(scope),
    ...(database === undefined ? {} : { database: replicaDatabaseKey(database) }),
});
export const identityNotice = (kind, identity) => replicaNotice(kind, replicaScopeOf(identity), replicaDatabaseScopeOf(identity));
export const isReplicaNotice = (value) => {
    if (value === null || typeof value !== "object")
        return false;
    const notice = value;
    return typeof notice.kind === "string" && NOTICE_KINDS.has(notice.kind) &&
        typeof notice.scope === "string" && notice.scope.length > 0 &&
        (notice.database === undefined || typeof notice.database === "string");
};
export const platformBroadcast = () => globalThis
    .BroadcastChannel;
export class ReplicaNoticeChannel {
    listeners = new Set();
    channel;
    closed = false;
    constructor(channel) {
        this.channel = channel;
    }
    static begin(options) {
        let channel;
        try {
            channel = options.broadcast === undefined
                ? undefined
                : new options.broadcast(options.name);
        }
        catch {
            channel = undefined;
        }
        const notices = new ReplicaNoticeChannel(channel);
        channel?.addEventListener("message", (event) => {
            notices.deliver(event.data);
        });
        return notices;
    }
    announces() {
        return this.channel !== undefined;
    }
    post(notice) {
        if (this.closed)
            return;
        try {
            this.channel?.postMessage(notice);
        }
        catch {
        }
    }
    subscribe(listener) {
        if (this.closed)
            return () => undefined;
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    deliver(data) {
        if (this.closed || !isReplicaNotice(data))
            return;
        for (const listener of [...this.listeners]) {
            try {
                listener(data);
            }
            catch {
            }
        }
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        this.listeners.clear();
        this.channel?.close();
        this.channel = undefined;
    }
}
//# sourceMappingURL=notices.js.map