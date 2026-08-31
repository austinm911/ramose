export declare const MAX_REPLICATION_REVISIONS_PER_BINDING = 8;
export type ReplicationRevisionRetentionDecision = {
    readonly type: "advance";
} | {
    readonly type: "insert";
    readonly evictCount: number;
} | {
    readonly type: "reject";
};
export declare const decideReplicationRevisionRetention: (input: {
    readonly existingBinding?: string;
    readonly candidateBinding: string;
    readonly bindingRevisionCount: number;
}) => ReplicationRevisionRetentionDecision;
//# sourceMappingURL=revision-retention.d.ts.map