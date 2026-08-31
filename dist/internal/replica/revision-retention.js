export const MAX_REPLICATION_REVISIONS_PER_BINDING = 8;
export const decideReplicationRevisionRetention = (input) => {
    if (input.existingBinding !== undefined) {
        return input.existingBinding === input.candidateBinding
            ? { type: "advance" }
            : { type: "reject" };
    }
    return {
        type: "insert",
        evictCount: Math.max(0, input.bindingRevisionCount + 1 -
            MAX_REPLICATION_REVISIONS_PER_BINDING),
    };
};
//# sourceMappingURL=revision-retention.js.map