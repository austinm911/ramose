import { type ReplicaDatabaseScope } from "./replica-lifecycle.ts";
export declare const REPLICA_LEADERSHIP_KEY_VERSION: 1;
export declare const replicaLeaderKey: (scope: ReplicaDatabaseScope, storage: string) => string;
export declare const isLeadershipKey: (key: string) => boolean;
export type LeadershipFence = {
    readonly key: string;
    readonly epoch: number;
};
export type LeadershipStatus = "waiting" | "leading" | "unelected" | "released";
export type LeadershipOptions = {
    readonly name: string;
    readonly locks: LockManager | undefined;
    readonly claim: () => Promise<number>;
    readonly onLeading: () => void;
};
export declare const platformLocks: () => LockManager | undefined;
export declare class SyncLeadership {
    private readonly options;
    private state;
    private epoch;
    private held;
    private granted;
    private readonly queued;
    private standing;
    private constructor();
    static begin(options: LeadershipOptions): SyncLeadership;
    status(): LeadershipStatus;
    submits(): boolean;
    fence(): LeadershipFence | undefined;
    private elect;
    private stand;
    private lead;
    standDown(): Promise<void>;
    release(): Promise<void>;
}
//# sourceMappingURL=leadership.d.ts.map