import * as Data from "effect/Data";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { ReadCompatibilityHash } from "../authorization/identities.js";
export const REPLICATION_PROTOCOL_VERSION = 1;
export const REPLICA_STORAGE_VERSION = 3;
export const INITIAL_REPLICA_BUILD_ID = "ramose-client-v1";
export const MAX_REPLICATION_REQUEST_BYTES = 65_536;
export const MAX_REPLICATION_FRAME_BYTES = 1_100_000;
export const MAX_REPLICATION_PATH_SEGMENTS = 1_024;
export const MAX_REPLICATION_STRING_BYTES = 131_072;
export const MAX_REPLICATION_RAW_VALUE_PART_BYTES = 98_304;
export const MAX_REPLICATION_DATOMS_PER_SNAPSHOT_CHUNK = 16;
export const MAX_REPLICATION_DATOMS_PER_CHANGE = 256;
export const MAX_REPLICATION_CHANGE_BYTES = 1_048_576;
export const REPLICATION_KEEPALIVE_INTERVAL_MS = 15_000;
const utf8 = new TextEncoder();
const strict = { onExcessProperty: "error" };
const boundedString = (maximum) => Schema.String.check(Schema.makeFilter((value) => utf8.encode(value).byteLength <= maximum, { expected: `a UTF-8 string no larger than ${maximum} bytes` }));
const nonEmptyBoundedString = (maximum) => boundedString(maximum).check(Schema.isMinLength(1));
const OPAQUE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const canonicalBase64 = Schema.makeFilter((value) => {
    try {
        return btoa(atob(value)) === value;
    }
    catch {
        return false;
    }
}, { expected: "canonical padded base64" });
export const OpaqueReplicationId = Schema.String.check(Schema.isPattern(OPAQUE_PATTERN));
export const ReplicationScope = Schema.Struct({
    type: Schema.Literal("database"),
});
const GraphPath = Schema.Array(nonEmptyBoundedString(4_096)).check(Schema.isMaxLength(MAX_REPLICATION_PATH_SEGMENTS));
export const ActivationRequest = Schema.Struct({
    type: Schema.Literal("Activate"),
    protocol: Schema.Natural,
    graphPath: GraphPath,
    scope: ReplicationScope,
    readCompatibilityHash: ReadCompatibilityHash,
    resumeRevision: Schema.optionalKey(OpaqueReplicationId),
});
const GraphLineage = Schema.Array(OpaqueReplicationId).check(Schema.isMaxLength(MAX_REPLICATION_PATH_SEGMENTS));
export const ReplicationIdentity = Schema.Struct({
    version: Schema.Literal(1),
    server: OpaqueReplicationId,
    principal: OpaqueReplicationId,
    database: OpaqueReplicationId,
    catalog: OpaqueReplicationId,
    readView: OpaqueReplicationId,
    readCompatibilityHash: ReadCompatibilityHash,
    graphLineage: GraphLineage,
    authenticator: OpaqueReplicationId,
});
const LongValue = Schema.Struct({
    type: Schema.Literal("long"),
    value: Schema.Int,
});
const DoubleValue = Schema.Struct({
    type: Schema.Literal("double"),
    value: Schema.Union([
        Schema.Finite,
        Schema.Literals(["positive-infinity", "negative-infinity"]),
    ]),
});
const StringValue = Schema.Struct({
    type: Schema.Literal("string"),
    value: boundedString(MAX_REPLICATION_STRING_BYTES),
});
const BooleanValue = Schema.Struct({
    type: Schema.Literal("boolean"),
    value: Schema.Boolean,
});
const ReferenceValue = Schema.Struct({
    type: Schema.Literal("ref"),
    value: OpaqueReplicationId,
});
const UuidValue = Schema.Struct({
    type: Schema.Literal("uuid"),
    value: Schema.String.check(Schema.isPattern(UUID_PATTERN)),
});
const InstantValue = Schema.Struct({
    type: Schema.Literal("instant"),
    value: Schema.Int,
});
const BytesValue = Schema.Struct({
    type: Schema.Literal("bytes"),
    value: Schema.String.check(Schema.isPattern(BASE64_PATTERN), Schema.isMaxLength(MAX_REPLICATION_STRING_BYTES), canonicalBase64),
});
const positiveNatural = Schema.Natural.check(Schema.makeFilter((value) => value > 0, { expected: "a positive safe integer" }));
export const SEALED_ENTITY_HANDLE_PATTERN = /^[A-Za-z0-9_-]{54}[AEIMQUYcgkosw048]$/;
export const SealedEntityHandle = Schema.String.check(Schema.isPattern(SEALED_ENTITY_HANDLE_PATTERN));
export const EntityHandleBinding = Schema.Struct({
    entity: OpaqueReplicationId,
    handle: SealedEntityHandle,
});
export const SnapshotStringValuePart = Schema.Struct({
    type: Schema.Literal("string-part"),
    identity: OpaqueReplicationId,
    index: Schema.Natural,
    chunks: positiveNatural,
    value: boundedString(MAX_REPLICATION_STRING_BYTES),
});
export const SnapshotBytesValuePart = Schema.Struct({
    type: Schema.Literal("bytes-part"),
    identity: OpaqueReplicationId,
    index: Schema.Natural,
    chunks: positiveNatural,
    value: Schema.String.check(Schema.isPattern(BASE64_PATTERN), Schema.isMaxLength(MAX_REPLICATION_STRING_BYTES), canonicalBase64),
});
export const LogicalValue = Schema.Union([
    LongValue,
    DoubleValue,
    StringValue,
    BooleanValue,
    ReferenceValue,
    UuidValue,
    InstantValue,
    BytesValue,
]);
export const SnapshotLogicalValue = Schema.Union([
    LogicalValue,
    SnapshotStringValuePart,
    SnapshotBytesValuePart,
]);
export const LogicalDatom = Schema.Struct({
    entity: OpaqueReplicationId,
    field: nonEmptyBoundedString(4_096),
    value: LogicalValue,
    op: Schema.Literals(["add", "retract"]),
});
export const SnapshotDatom = Schema.Struct({
    entity: OpaqueReplicationId,
    field: nonEmptyBoundedString(4_096),
    value: SnapshotLogicalValue,
    op: Schema.Literal("add"),
});
export const SnapshotStart = Schema.Struct({
    type: Schema.Literal("SnapshotStart"),
    protocol: Schema.Literal(REPLICATION_PROTOCOL_VERSION),
    identity: ReplicationIdentity,
    snapshot: OpaqueReplicationId,
    revision: OpaqueReplicationId,
});
const handleBindings = (datoms) => Schema.Array(EntityHandleBinding).check(Schema.isMaxLength(datoms * 2));
export const SnapshotChunk = Schema.Struct({
    type: Schema.Literal("SnapshotChunk"),
    protocol: Schema.Literal(REPLICATION_PROTOCOL_VERSION),
    identity: ReplicationIdentity,
    snapshot: OpaqueReplicationId,
    index: Schema.Natural,
    datoms: Schema.Array(SnapshotDatom).check(Schema.isMaxLength(MAX_REPLICATION_DATOMS_PER_SNAPSHOT_CHUNK)),
    handles: handleBindings(MAX_REPLICATION_DATOMS_PER_SNAPSHOT_CHUNK),
});
export const SnapshotCommit = Schema.Struct({
    type: Schema.Literal("SnapshotCommit"),
    protocol: Schema.Literal(REPLICATION_PROTOCOL_VERSION),
    identity: ReplicationIdentity,
    snapshot: OpaqueReplicationId,
    revision: OpaqueReplicationId,
    chunks: Schema.Natural,
});
export const Change = Schema.Struct({
    type: Schema.Literal("Change"),
    protocol: Schema.Literal(REPLICATION_PROTOCOL_VERSION),
    identity: ReplicationIdentity,
    from: OpaqueReplicationId,
    revision: OpaqueReplicationId,
    datoms: Schema.Array(LogicalDatom).check(Schema.isMaxLength(MAX_REPLICATION_DATOMS_PER_CHANGE)),
    handles: handleBindings(MAX_REPLICATION_DATOMS_PER_CHANGE),
});
export const ResumeReady = Schema.Struct({
    type: Schema.Literal("ResumeReady"),
    protocol: Schema.Literal(REPLICATION_PROTOCOL_VERSION),
    identity: ReplicationIdentity,
    revision: OpaqueReplicationId,
});
export const Reset = Schema.Struct({
    type: Schema.Literal("Reset"),
    protocol: Schema.Literal(REPLICATION_PROTOCOL_VERSION),
    identity: ReplicationIdentity,
});
export const KeepAlive = Schema.Struct({
    type: Schema.Literal("KeepAlive"),
    protocol: Schema.Literal(REPLICATION_PROTOCOL_VERSION),
    identity: ReplicationIdentity,
});
export const TerminalError = Schema.Struct({
    type: Schema.Literal("TerminalError"),
    protocol: Schema.Literal(REPLICATION_PROTOCOL_VERSION),
    code: Schema.Literals(["incompatible-version", "update-required", "closed"]),
    identity: Schema.optionalKey(ReplicationIdentity),
});
export const ReplicationFrame = Schema.Union([
    SnapshotStart,
    SnapshotChunk,
    SnapshotCommit,
    Change,
    ResumeReady,
    Reset,
    KeepAlive,
    TerminalError,
]);
export class ReplicationProtocolError extends Data.TaggedError("ReplicationProtocolError") {
}
const parseBoundedJson = (text, maximum) => {
    if (utf8.encode(text).byteLength > maximum) {
        return Result.fail(new ReplicationProtocolError({ reason: "oversized" }));
    }
    try {
        return Result.succeed(JSON.parse(text));
    }
    catch {
        return Result.fail(new ReplicationProtocolError({ reason: "malformed" }));
    }
};
const hasIncompatibleProtocol = (value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const protocol = value.protocol;
    return Number.isSafeInteger(protocol) && protocol >= 0 &&
        protocol !== REPLICATION_PROTOCOL_VERSION;
};
export const decodeActivationRequest = (text) => Result.gen(function* () {
    const json = yield* parseBoundedJson(text, MAX_REPLICATION_REQUEST_BYTES);
    if (hasIncompatibleProtocol(json)) {
        return yield* Result.fail(new ReplicationProtocolError({ reason: "incompatible-version" }));
    }
    const decoded = Schema.decodeUnknownResult(ActivationRequest, strict)(json);
    if (Result.isFailure(decoded)) {
        return yield* Result.fail(new ReplicationProtocolError({ reason: "malformed" }));
    }
    return decoded.success;
});
export const decodeReplicationFrame = (text) => Result.gen(function* () {
    const json = yield* parseBoundedJson(text, MAX_REPLICATION_FRAME_BYTES);
    if (hasIncompatibleProtocol(json)) {
        return yield* Result.fail(new ReplicationProtocolError({ reason: "incompatible-version" }));
    }
    const decoded = Schema.decodeUnknownResult(ReplicationFrame, strict)(json);
    return yield* Result.mapError(decoded, () => new ReplicationProtocolError({ reason: "malformed" }));
});
export const encodeActivationRequest = (request) => {
    const encoded = JSON.stringify(Schema.encodeUnknownSync(ActivationRequest)(request));
    if (utf8.encode(encoded).byteLength > MAX_REPLICATION_REQUEST_BYTES) {
        throw new ReplicationProtocolError({ reason: "oversized" });
    }
    return encoded;
};
const encodeReplicationFrameUnchecked = (frame) => JSON.stringify(Schema.encodeUnknownSync(ReplicationFrame)(frame));
export const replicationFrameFitsBound = (frame) => utf8.encode(encodeReplicationFrameUnchecked(frame)).byteLength <=
    MAX_REPLICATION_FRAME_BYTES;
export const encodeReplicationFrame = (frame) => {
    const encoded = encodeReplicationFrameUnchecked(frame);
    if (utf8.encode(encoded).byteLength > MAX_REPLICATION_FRAME_BYTES) {
        throw new ReplicationProtocolError({ reason: "oversized" });
    }
    return encoded;
};
//# sourceMappingURL=protocol.js.map