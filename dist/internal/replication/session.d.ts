import type { Db } from "../core/db.ts";
import type { AttributeSpec } from "../core/schema.ts";
import type { ReadCompatibilityHash } from "../authorization/identities.ts";
import { IndexedDbReplicaStorage, type ReplicaCacheCandidate } from "./indexeddb.ts";
import type { ReplicationFrame, ReplicationIdentity } from "./protocol.ts";
import { type ReplicationActivationInput } from "./transport.ts";
export type ReplicationSessionValue = {
    readonly db: Db;
    readonly identity: ReplicationIdentity;
    readonly revision: string;
    readonly handles: ReadonlyMap<string, number>;
    readonly stale: boolean;
};
export type ReplicationSessionSnapshot = {
    readonly status: "connecting" | "open" | "terminal" | "failed" | "closed";
    readonly value?: ReplicationSessionValue;
    readonly terminalCode?: "closed" | "incompatible-version" | "update-required";
    readonly failure?: "unauthorized" | "transport" | "fenced";
};
export type ReplicationSessionObserver = (snapshot: ReplicationSessionSnapshot) => void;
export type ReplicationSessionOptions = {
    readonly activation: ReplicationActivationInput;
    readonly credential: string;
    readonly cacheKey?: string;
    readonly graphLineage?: readonly string[];
    readonly attributes: readonly AttributeSpec[];
    readonly readCompatibilityHash: ReadCompatibilityHash;
    readonly storage: IndexedDbReplicaStorage;
    readonly onActivationOutcome?: (() => void | Promise<void>) | undefined;
};
type ChangeFrame = Extract<ReplicationFrame, {
    readonly type: "Change";
}>;
type TerminalFrame = Extract<ReplicationFrame, {
    readonly type: "TerminalError";
}>;
export type ReplicationCandidateFrameAction = "resume" | "change" | "duplicate" | "reset" | "snapshot" | "keep-alive" | "terminal" | "invalid";
export declare const classifyReplicationChange: (prior: Pick<ReplicationSessionValue, "identity" | "revision"> | undefined, frame: ChangeFrame) => "apply" | "duplicate" | "gap";
export declare const classifyReplicationCandidateFrame: (prior: Pick<ReplicaCacheCandidate, "identity" | "revision"> | undefined, frame: ReplicationFrame) => ReplicationCandidateFrameAction;
export declare const replicationTerminalSnapshot: (frame: TerminalFrame, value?: ReplicationSessionValue) => ReplicationSessionSnapshot;
export declare class ReplicationSession {
    private readonly storage;
    private readonly attributes;
    private readonly readCompatibilityHash;
    private readonly onActivationOutcome;
    private readonly controller;
    private readonly observers;
    private generation;
    private loop;
    private state;
    private readonly lease;
    private tracking;
    private trackedDatabase;
    private releaseRetention;
    private retainedDb;
    private confirmedIdentity;
    private bound;
    private refreshing;
    private fenced;
    private constructor();
    refreshFromDurable(): Promise<boolean>;
    private readDurableHead;
    private currentIdentity;
    revalidate(): Promise<boolean>;
    private track;
    private untrack;
    static open(options: ReplicationSessionOptions): Promise<ReplicationSession>;
    snapshot(): ReplicationSessionSnapshot;
    observe(observer: ReplicationSessionObserver): () => void;
    close(): Promise<void>;
    private current;
    private publish;
    private adopt;
    private release;
    private notify;
    private settled;
    private quarantine;
    private publishReplica;
    private publishStale;
    private confirmedCandidate;
    private confirmed;
    private acceptConfirmedInitial;
    private accept;
}
export {};
//# sourceMappingURL=session.d.ts.map