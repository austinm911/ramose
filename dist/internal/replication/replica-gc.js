import * as Data from "effect/Data";
import { REPLICA_STORAGE_VERSION } from "./protocol.js";
export const replicaSweepKey = (partition) => [`ramose-replica-sweep-v${REPLICA_STORAGE_VERSION}`, partition].join(":");
export const replicaSweepPrefix = (partitionPrefix) => [`ramose-replica-sweep-v${REPLICA_STORAGE_VERSION}`, partitionPrefix].join(":");
export class ReplicaReachability {
    known = new Set();
    frontier = [];
    failed = false;
    constructor(roots) {
        for (const root of roots)
            this.add(root);
    }
    add(hash) {
        if (this.known.has(hash))
            return;
        this.known.add(hash);
        this.frontier.push(hash);
    }
    next(limit) {
        return this.frontier.splice(0, Math.max(0, limit));
    }
    expand(children) {
        for (const child of children)
            this.add(child);
    }
    fail() {
        this.failed = true;
    }
    get pending() {
        return this.frontier.length > 0;
    }
    get complete() {
        return !this.failed && this.frontier.length === 0;
    }
    get reachable() {
        return this.known;
    }
}
export const unreachableNodeHashes = (stored, live) => {
    const swept = [];
    const seen = new Set();
    for (const hash of stored) {
        if (live.has(hash) || seen.has(hash))
            continue;
        seen.add(hash);
        swept.push(hash);
    }
    return Object.freeze(swept);
};
export const stagingIsSweepable = (staging, committedRevision) => staging !== undefined && staging.baseRevision !== committedRevision;
const QUOTA_CODES = new Set([
    22,
    1014,
]);
const QUOTA_NAMES = new Set([
    "QuotaExceededError",
    "NS_ERROR_DOM_QUOTA_REACHED",
    "QUOTA_EXCEEDED_ERR",
]);
export const classifyReplicaStorageFailure = (error) => {
    if (typeof error !== "object" || error === null)
        return "unrelated";
    const named = error;
    if (typeof named.name === "string" && QUOTA_NAMES.has(named.name))
        return "quota";
    if (typeof named.code === "number" && QUOTA_CODES.has(named.code))
        return "quota";
    return "unrelated";
};
export const replicaQuotaRecovery = (attempt, failure) => failure !== "quota" ? "propagate" : attempt >= 2 ? "exhausted" : "reclaim";
export class ReplicaQuotaExhaustedError extends Data.TaggedError("ReplicaQuotaExhaustedError") {
}
//# sourceMappingURL=replica-gc.js.map