import type { IndexedDbReplicaStorage } from "../internal/replication/indexeddb.ts";
import type { SyncLeadership } from "../internal/replication/leadership.ts";
import { type ReplicaDatabaseScope, type ReplicaScope } from "../internal/replication/replica-lifecycle.ts";
import { type MutationEndpoint, type QueueProgress } from "../internal/replication/submission.ts";
import type { ReceiptDriver } from "./receipt.ts";
export type PassOutcome = "withdraw" | "stand-down" | "again" | "later" | "settled";
export declare const passOutcome: (progress: readonly QueueProgress[]) => PassOutcome;
type PassCredential = {
    readonly token: string;
    readonly cacheKey: string;
};
export type SubmissionContext = {
    readonly storage: () => Promise<IndexedDbReplicaStorage>;
    readonly leadership: () => SyncLeadership | undefined;
    readonly credential: () => Promise<PassCredential>;
    readonly endpoint: (receiver: ReplicaDatabaseScope, credential: PassCredential) => MutationEndpoint | undefined;
    readonly resolve: (receiver: ReplicaDatabaseScope) => void;
    readonly retire: (receiver: ReplicaDatabaseScope) => void;
    readonly revalidate: () => Promise<void>;
    readonly reconcile: (receiver: ReplicaDatabaseScope, progress: readonly QueueProgress[]) => Promise<void>;
    readonly live: () => boolean;
};
export declare class SubmissionLoop {
    private readonly context;
    private readonly receipts;
    private readonly pending;
    private readonly again;
    private readonly retries;
    private readonly inflight;
    constructor(context: SubmissionContext);
    track(receiver: ReplicaDatabaseScope, driver: ReceiptDriver): void;
    settleFromDurable(): Promise<void>;
    request(scope: ReplicaScope): void;
    settled(): Promise<void>;
    private pass;
    private later;
    close(): void;
    private settle;
}
export {};
//# sourceMappingURL=submission.d.ts.map