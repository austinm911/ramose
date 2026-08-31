import { type ReplicationIdentity } from "./protocol.ts";
export declare const REPLICA_GENERATIONS_STORE = "replica-generations-v1";
export declare const REPLICA_CLEAR_BARRIER_KEY = "ramose-replica-clear-barrier-v1";
export declare const REPLICA_COMMITTED_HEADS_STORE = "replica-committed-heads-v1";
export type ReplicaScope = {
    readonly server: string;
    readonly principal: string;
};
export type ReplicaDatabaseScope = ReplicaScope & {
    readonly database: string;
};
export declare const replicaScopeOf: (identity: ReplicationIdentity) => ReplicaScope;
export declare const replicaDatabaseScopeOf: (identity: ReplicationIdentity) => ReplicaDatabaseScope;
export declare const REPLICA_LIFECYCLE_KEY_VERSION: 2;
export declare const replicaScopeKey: (scope: ReplicaScope) => string;
export declare const replicaDatabaseKey: (scope: ReplicaDatabaseScope) => string;
export declare const replicaPartitionKey: (identity: ReplicationIdentity) => string;
export declare const replicaPartitionScopeKey: (partition: string) => string | undefined;
export declare const replicaScopePartitionPrefix: (scope: ReplicaScope) => string;
export declare const replicaDatabasePartitionPrefix: (scope: ReplicaDatabaseScope) => string;
export declare const identityInScope: (identity: ReplicationIdentity, scope: ReplicaScope) => boolean;
export declare const identityInDatabase: (identity: ReplicationIdentity, scope: ReplicaDatabaseScope) => boolean;
export declare const withConfirmedScope: (scopes: readonly string[] | undefined, scope: string) => readonly string[];
export declare const withoutConfirmedScope: (scopes: readonly string[] | undefined, scope: string) => readonly string[];
declare const ReplicaScopeUnconfirmedError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ReplicaScopeUnconfirmedError";
} & Readonly<A>;
export declare class ReplicaScopeUnconfirmedError extends ReplicaScopeUnconfirmedError_base<{
    readonly scope: string;
}> {
}
declare const ReplicaFencedError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ReplicaFencedError";
} & Readonly<A>;
export declare class ReplicaFencedError extends ReplicaFencedError_base<{
    readonly key: string;
    readonly expected: number;
    readonly observed: number;
}> {
}
declare const ReplicaScopeClearedError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ReplicaScopeClearedError";
} & Readonly<A>;
export declare class ReplicaScopeClearedError extends ReplicaScopeClearedError_base<{
    readonly scope: string;
}> {
}
declare const ReplicaDatabaseActiveError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ReplicaDatabaseActiveError";
} & Readonly<A>;
export declare class ReplicaDatabaseActiveError extends ReplicaDatabaseActiveError_base<{
    readonly database: string;
    readonly pins: number;
}> {
}
export declare const isReplicaFenceError: (error: unknown) => boolean;
export type ReplicaFenceDecision = "adopt" | "match" | "fenced";
export declare const replicaFenceDecision: (observed: number | undefined, current: number) => ReplicaFenceDecision;
export declare class ReplicaLease {
    private readonly admission;
    private readonly observed;
    constructor(admission?: number);
    admit(key: string, clearedAt: number): void;
    admittedAt(): number;
    observe(key: string, current: number): void;
    adopt(key: string, current: number): void;
    generationOf(key: string): number | undefined;
}
export {};
//# sourceMappingURL=replica-lifecycle.d.ts.map