import type { ReadCompatibilityHash } from "../authorization/identities.ts";
import type { ReplicaRouteSlot } from "./route-slot.ts";
import type { MutationTransport } from "./submission.ts";
import { type OpaqueReplicationId, type ReplicationFrame } from "./protocol.ts";
export type ReplicationActivationAddress = {
    readonly origin: string;
    readonly root: string;
    readonly graphPath: readonly string[];
    readonly endpoint: string;
};
export type ReplicationActivationInput = {
    readonly server: string;
    readonly root: string;
    readonly graphPath: readonly string[];
};
export declare class ReplicationTransportError extends Error {
    readonly name: string;
}
export declare class ReplicationUnauthorizedError extends ReplicationTransportError {
    readonly name = "ReplicationUnauthorizedError";
}
export declare const replicationActivationAddress: (input: ReplicationActivationInput) => ReplicationActivationAddress;
export declare const replicationCredentialFingerprint: (credential: string, activation: ReplicationActivationAddress, routeSlot: ReplicaRouteSlot) => Promise<string>;
export declare const replicationCacheSelector: (cacheKey: string, activation: ReplicationActivationAddress) => Promise<string>;
export type OpenReplicationInput = {
    readonly activation: ReplicationActivationAddress;
    readonly credential: string;
    readonly readCompatibilityHash: ReadCompatibilityHash;
    readonly resumeRevision?: OpaqueReplicationId;
    readonly signal: AbortSignal;
};
export declare const openReplicationResponse: (input: OpenReplicationInput) => Promise<Response>;
export declare function readReplicationFrames(response: Response, signal?: AbortSignal): AsyncGenerator<ReplicationFrame, void, undefined>;
export declare const submitMutation: MutationTransport;
export declare function decodeReplicationNdjson(chunks: AsyncIterable<Uint8Array>, signal?: AbortSignal): AsyncGenerator<ReplicationFrame, void, undefined>;
//# sourceMappingURL=transport.d.ts.map