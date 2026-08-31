import * as Result from "effect/Result";
import type { ReadCompatibilityHash } from "../authorization/identities.ts";
import { type Datom, type IndexId } from "../core/datom.ts";
import type { Roots } from "../core/db.ts";
import { type NodeRef, type TreeNode } from "../core/tree.ts";
import { REPLICA_STORAGE_VERSION, type LogicalDatom, type ReplicationIdentity } from "./protocol.ts";
import { type ReplicaAttributeSpec } from "./replica-schema.ts";
export type ReplicaManifest = {
    readonly partition: string;
    readonly storageVersion: typeof REPLICA_STORAGE_VERSION;
    readonly identity: ReplicationIdentity;
    readonly readCompatibilityHash: ReadCompatibilityHash;
    readonly revision: string;
    readonly datoms: readonly LogicalDatom[];
    readonly attributes: readonly ReplicaAttributeSpec[];
    readonly entityIds: readonly (readonly [string, number])[];
    readonly entityHandles: readonly (readonly [string, string])[];
    readonly attributeIds: readonly (readonly [string, number])[];
    readonly roots: Roots;
    readonly nextLocalId: number;
    readonly installId?: string | undefined;
};
export type ReplicaCorruptionReason = "manifest-undecodable" | "manifest-invariant" | "node-missing" | "node-hash" | "node-undecodable" | "node-kind" | "node-invariant";
export type ReplicaIncompatibilityReason = "read-compatibility" | "schema-metadata";
export type ReplicaUnusableReason = ReplicaCorruptionReason | ReplicaIncompatibilityReason;
export type ReplicaRecoveryAction = "replacement-required" | "update-required";
export declare const replicaRecoveryAction: (reason: ReplicaUnusableReason) => ReplicaRecoveryAction;
export type ReplicaIntegrityFailure = {
    readonly reason: ReplicaCorruptionReason;
    readonly detail: string;
    readonly index?: IndexId;
    readonly hash?: string;
};
declare const ReplicaCorruptError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ReplicaCorruptError";
} & Readonly<A>;
export declare class ReplicaCorruptError extends ReplicaCorruptError_base<{
    readonly partition: string;
    readonly reason: ReplicaUnusableReason;
    readonly detail: string;
}> {
}
export type ReplicaRestoreOutcome<A> = {
    readonly _tag: "restored";
    readonly replica: A;
} | {
    readonly _tag: "absent";
} | {
    readonly _tag: "contended";
    readonly partition: string;
    readonly attempts: number;
} | {
    readonly _tag: "replacement-required";
    readonly partition: string;
    readonly reason: ReplicaUnusableReason;
    readonly detail: string;
} | {
    readonly _tag: "update-required";
    readonly partition: string;
    readonly reason: ReplicaUnusableReason;
    readonly detail: string;
};
export declare const replicaRestored: <A>(replica: A) => ReplicaRestoreOutcome<A>;
export declare const replicaAbsent: <A>() => ReplicaRestoreOutcome<A>;
export declare const replicaContended: <A>(partition: string, attempts: number) => ReplicaRestoreOutcome<A>;
export declare const replicaUnusable: <A>(partition: string, reason: ReplicaUnusableReason, detail: string) => ReplicaRestoreOutcome<A>;
export declare const restoredReplica: <A>(outcome: ReplicaRestoreOutcome<A>) => A | undefined;
export declare const replicaRefused: <A>(outcome: ReplicaRestoreOutcome<A>) => outcome is Extract<ReplicaRestoreOutcome<A>, {
    readonly _tag: "replacement-required" | "update-required";
}>;
export declare const validateReplicaNodeRef: (ref: unknown, where: string, index?: IndexId) => ReplicaIntegrityFailure | undefined;
export declare const validateReplicaRoots: (roots: unknown) => ReplicaIntegrityFailure | undefined;
export declare const replicaManifestIdentity: (record: unknown) => ReplicationIdentity | undefined;
export declare const replicaManifestFingerprint: (record: unknown) => string;
export type ReplicaManifestExpectation = {
    readonly partition: string;
    readonly readCompatibilityHash: ReadCompatibilityHash;
};
export declare const validateReplicaManifest: (record: unknown, expected: ReplicaManifestExpectation) => Result.Result<ReplicaManifest, ReplicaIntegrityFailure>;
export type ReplicaIndexDigest = {
    datoms: number;
    sum: number;
    xor: number;
    basis: number;
};
export declare const emptyReplicaIndexDigest: () => ReplicaIndexDigest;
export declare const digestReplicaDatoms: (digest: ReplicaIndexDigest, datoms: readonly Datom[]) => void;
export declare const sameReplicaIndexContents: (left: ReplicaIndexDigest, right: ReplicaIndexDigest) => boolean;
export type ReplicaIndexDigests = Record<IndexId, ReplicaIndexDigest>;
export declare const expectedReplicaContents: (manifest: ReplicaManifest) => Result.Result<ReplicaIndexDigests, ReplicaIntegrityFailure>;
export declare const validateReplicaContents: (roots: Roots, walked: ReplicaIndexDigests, expected: ReplicaIndexDigests) => ReplicaIntegrityFailure | undefined;
export declare const validateReplicaNode: (index: IndexId, ref: NodeRef, decoded: {
    readonly index: IndexId;
    readonly node: TreeNode;
}, expectedKey?: Datom) => ReplicaIntegrityFailure | undefined;
export {};
//# sourceMappingURL=replica-integrity.d.ts.map