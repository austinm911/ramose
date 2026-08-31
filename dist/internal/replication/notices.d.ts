import type { ReplicationIdentity } from "./protocol.ts";
import { type ReplicaDatabaseScope, type ReplicaScope } from "./replica-lifecycle.ts";
export declare const REPLICA_NOTICE_CHANNEL_VERSION: 1;
export declare const replicaNoticeChannelName: (storage: string) => string;
export type ReplicaNoticeKind = "replica" | "layer" | "receipt" | "fence" | "reset" | "selector";
export type ReplicaNotice = {
    readonly kind: ReplicaNoticeKind;
    readonly scope: string;
    readonly database?: string;
};
export declare const replicaNotice: (kind: ReplicaNoticeKind, scope: ReplicaScope, database?: ReplicaDatabaseScope | undefined) => ReplicaNotice;
export declare const identityNotice: (kind: ReplicaNoticeKind, identity: ReplicationIdentity) => ReplicaNotice;
export declare const isReplicaNotice: (value: unknown) => value is ReplicaNotice;
export type ReplicaNoticeListener = (notice: ReplicaNotice) => void;
export type BroadcastConstructor = new (name: string) => BroadcastChannel;
export declare const platformBroadcast: () => BroadcastConstructor | undefined;
export declare class ReplicaNoticeChannel {
    private readonly listeners;
    private channel;
    private closed;
    private constructor();
    static begin(options: {
        readonly name: string;
        readonly broadcast: BroadcastConstructor | undefined;
    }): ReplicaNoticeChannel;
    announces(): boolean;
    post(notice: ReplicaNotice): void;
    subscribe(listener: ReplicaNoticeListener): () => void;
    private deliver;
    close(): void;
}
//# sourceMappingURL=notices.d.ts.map