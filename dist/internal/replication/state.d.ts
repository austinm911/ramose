import * as Result from "effect/Result";
import type { LogicalDatom, ReplicationFrame, ReplicationIdentity, SnapshotDatom } from "./protocol.ts";
export type EntityHandles = ReadonlyMap<string, string>;
export declare const emptyEntityHandles: EntityHandles;
export type CommittedReplica = {
    readonly revision: string;
    readonly datoms: readonly LogicalDatom[];
    readonly handles: EntityHandles;
};
export type SnapshotStaging = {
    readonly snapshot: string;
    readonly revision: string;
    readonly chunks: ReadonlyMap<number, readonly SnapshotDatom[]>;
    readonly handles: EntityHandles;
};
export type ClientReplicationState = {
    readonly identity?: ReplicationIdentity;
    readonly committed?: CommittedReplica;
    readonly staging?: SnapshotStaging;
    readonly closed: boolean;
};
declare const ReplicationTransitionError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ReplicationTransitionError";
} & Readonly<A>;
export declare class ReplicationTransitionError extends ReplicationTransitionError_base<{
    readonly reason: string;
}> {
}
export declare const emptyClientReplicationState: () => ClientReplicationState;
export declare const sameReplicationIdentity: (left: ReplicationIdentity, right: ReplicationIdentity) => boolean;
export declare const applyReplicationFrame: (state: ClientReplicationState, frame: ReplicationFrame) => Result.Result<ClientReplicationState, ReplicationTransitionError>;
export {};
//# sourceMappingURL=state.d.ts.map