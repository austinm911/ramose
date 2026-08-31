import * as Data from "effect/Data";
import { REPLICA_STORAGE_VERSION } from "./protocol.js";
export const REPLICA_GENERATIONS_STORE = "replica-generations-v1";
export const REPLICA_CLEAR_BARRIER_KEY = "ramose-replica-clear-barrier-v1";
export const REPLICA_COMMITTED_HEADS_STORE = "replica-committed-heads-v1";
export const replicaScopeOf = (identity) => ({
    server: identity.server,
    principal: identity.principal,
});
export const replicaDatabaseScopeOf = (identity) => ({
    server: identity.server,
    principal: identity.principal,
    database: identity.database,
});
export const REPLICA_LIFECYCLE_KEY_VERSION = 2;
export const replicaScopeKey = (scope) => [
    `ramose-replica-scope-v${REPLICA_LIFECYCLE_KEY_VERSION}`,
    scope.server,
    scope.principal,
].join(":");
export const replicaDatabaseKey = (scope) => [
    `ramose-replica-database-v${REPLICA_LIFECYCLE_KEY_VERSION}`,
    scope.server,
    scope.principal,
    scope.database,
].join(":");
export const replicaPartitionKey = (identity) => [
    `ramose-replica-v${REPLICA_STORAGE_VERSION}`,
    identity.server,
    identity.principal,
    identity.database,
    identity.readView,
    identity.readCompatibilityHash,
].join(":");
export const replicaPartitionScopeKey = (partition) => {
    const parts = partition.split(":");
    if (parts.length !== 6 || parts[0] !== `ramose-replica-v${REPLICA_STORAGE_VERSION}`) {
        return undefined;
    }
    return replicaScopeKey({ server: parts[1], principal: parts[2] });
};
export const replicaScopePartitionPrefix = (scope) => [`ramose-replica-v${REPLICA_STORAGE_VERSION}`, scope.server, scope.principal, ""]
    .join(":");
export const replicaDatabasePartitionPrefix = (scope) => [
    `ramose-replica-v${REPLICA_STORAGE_VERSION}`,
    scope.server,
    scope.principal,
    scope.database,
    "",
].join(":");
export const identityInScope = (identity, scope) => identity.server === scope.server && identity.principal === scope.principal;
export const identityInDatabase = (identity, scope) => identityInScope(identity, scope) && identity.database === scope.database;
export const withConfirmedScope = (scopes, scope) => scopes === undefined
    ? [scope]
    : scopes.includes(scope)
        ? scopes
        : [...scopes, scope].sort();
export const withoutConfirmedScope = (scopes, scope) => (scopes ?? []).filter((entry) => entry !== scope);
export class ReplicaScopeUnconfirmedError extends Data.TaggedError("ReplicaScopeUnconfirmedError") {
}
export class ReplicaFencedError extends Data.TaggedError("ReplicaFencedError") {
}
export class ReplicaScopeClearedError extends Data.TaggedError("ReplicaScopeClearedError") {
}
export class ReplicaDatabaseActiveError extends Data.TaggedError("ReplicaDatabaseActiveError") {
}
export const isReplicaFenceError = (error) => {
    const tag = error?._tag;
    return tag === "ReplicaFencedError" || tag === "ReplicaScopeClearedError";
};
export const replicaFenceDecision = (observed, current) => observed === undefined ? "adopt" : observed === current ? "match" : "fenced";
export class ReplicaLease {
    admission;
    observed = new Map();
    constructor(admission = 0) {
        this.admission = admission;
    }
    admit(key, clearedAt) {
        if (clearedAt <= this.admission)
            return;
        throw new ReplicaFencedError({
            key,
            expected: this.admission,
            observed: clearedAt,
        });
    }
    admittedAt() {
        return this.admission;
    }
    observe(key, current) {
        const decision = replicaFenceDecision(this.observed.get(key), current);
        if (decision === "fenced") {
            throw new ReplicaFencedError({
                key,
                expected: this.observed.get(key),
                observed: current,
            });
        }
        if (decision === "adopt")
            this.observed.set(key, current);
    }
    adopt(key, current) {
        this.observed.set(key, current);
    }
    generationOf(key) {
        return this.observed.get(key);
    }
}
//# sourceMappingURL=replica-lifecycle.js.map