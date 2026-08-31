import * as Effect from "effect/Effect";
import { isAllocationSlotName } from "../../db/allocations.js";
import { InvalidRequest } from "../../db/Errors.js";
import { ENTITY_ID_CODEC, entityIdEnvelope, isClientRef, isEntityId, } from "../../db/refs.js";
import { sameEpochScope } from "./entity-targets.js";
import { sha256Hex } from "../core/bytes.js";
import { toJson } from "../core/json.js";
import { canonicalizeJson } from "./canonical-json.js";
import { OperationVersion } from "./identities.js";
export const INVOCATION_RECEIPT_VERSION = 2;
export const LEGACY_INVOCATION_RECEIPT_VERSIONS = [1];
export const MAX_INVOCATION_ID_LENGTH = 256;
const MAX_SEALED_HANDLE_LENGTH = 4096;
const INVOCATION_SCOPE_DIGEST_DOMAIN = "ramose/authoritative-invocation-scope/v2\0";
const INVOCATION_DIGEST_DOMAIN = "ramose/authoritative-invocation/v2\0";
const UTF8 = new TextEncoder();
const DIGEST_RE = /^[0-9a-f]{64}$/;
export const allocationMappingsResolvable = (mappings, current) => sameEpochScope(mappings, current) &&
    mappings.entries.every((entry) => {
        const envelope = entityIdEnvelope(entry.entityId);
        return envelope !== undefined &&
            envelope.codecVersion === ENTITY_ID_CODEC &&
            envelope.keyId === current.keyId;
    });
const invalid = (message) => new InvalidRequest({ message });
export const requireInvocationId = (value) => {
    if (typeof value !== "string" || value.length === 0 ||
        value.length > MAX_INVOCATION_ID_LENGTH) {
        throw invalid(`invocationId must be a non-empty string of at most ${MAX_INVOCATION_ID_LENGTH} characters`);
    }
    return value;
};
export const invocationPrincipalId = (invocation) => {
    const subject = invocation.caller.claims.sub;
    if (typeof subject !== "string" || subject.length === 0) {
        throw invalid("operation invocation requires a verified principal subject");
    }
    return subject;
};
export const invocationScopeMaterial = (invocation) => ({
    version: INVOCATION_RECEIPT_VERSION,
    database: invocation.database,
    principal: {
        claims: invocation.caller.claims,
        classes: [...invocation.caller.classes],
    },
    graph: invocation.routeDerivation === undefined
        ? null
        : {
            rootDatabase: invocation.routeDerivation.rootDatabase,
            graphs: invocation.routeDerivation.graphs.map((graph) => ({
                graphEntity: graph.graphEntity,
                catalogKey: graph.catalogKey,
            })),
        },
});
export const invocationDigestMaterial = (invocation, operationVersion) => ({
    version: INVOCATION_RECEIPT_VERSION,
    operation: {
        version: operationVersion,
        owner: {
            kind: invocation.owner.kind,
            name: invocation.owner.name,
        },
        localName: invocation.localName,
    },
    target: invocation.target === undefined
        ? null
        : toJson(invocation.target),
    input: invocation.input === undefined
        ? { present: false }
        : { present: true, value: invocation.input },
    ...(invocation.allocations === undefined || invocation.allocations.length === 0
        ? {}
        : {
            allocations: invocation.allocations.map((allocation) => ({
                slot: allocation.slot,
                clientRef: allocation.clientRef,
            })),
        }),
});
const hashCanonical = Effect.fn("Authorization.hashInvocationReceiptMaterial")(function* (domain, material) {
    return yield* Effect.tryPromise({
        try: () => sha256Hex(UTF8.encode(`${domain}${canonicalizeJson(material)}`)),
        catch: () => invalid("operation invocation must contain canonical JSON data"),
    });
});
export const requireSuppliedOperationVersion = (value) => {
    if (value === undefined)
        return undefined;
    if (typeof value !== "string" || !DIGEST_RE.test(value)) {
        throw invalid("operationVersion must be a canonical operation version digest");
    }
    return OperationVersion.make(value);
};
export const prepareInvocationReceipt = Effect.fn("Authorization.prepareInvocationReceipt")(function* (invocation, operationVersion) {
    const invocationId = requireInvocationId(invocation.invocationId);
    const principalId = invocationPrincipalId(invocation);
    const [scopeDigest, invocationDigest] = yield* Effect.all([
        hashCanonical(INVOCATION_SCOPE_DIGEST_DOMAIN, invocationScopeMaterial(invocation)),
        hashCanonical(INVOCATION_DIGEST_DOMAIN, invocationDigestMaterial(invocation, operationVersion)),
    ]);
    return Object.freeze({
        version: INVOCATION_RECEIPT_VERSION,
        principalId,
        invocationId,
        scopeDigest,
        operationVersion,
        invocationDigest,
    });
});
const sameIdentity = (stored, prepared) => stored.version === prepared.version &&
    stored.principalId === prepared.principalId &&
    stored.invocationId === prepared.invocationId &&
    stored.scopeDigest === prepared.scopeDigest &&
    stored.operationVersion === prepared.operationVersion &&
    stored.invocationDigest === prepared.invocationDigest;
const hasExactKeys = (value, keys) => {
    const expected = new Set(keys);
    return Object.keys(value).length === expected.size &&
        Object.keys(value).every((key) => expected.has(key));
};
const isReplayTargetPostCommit = (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const record = value;
    if (record.kind === "visible") {
        return hasExactKeys(record, ["kind"]);
    }
    if (record.kind === "absent" &&
        typeof record.authorizationDigest === "string" &&
        DIGEST_RE.test(record.authorizationDigest) &&
        Array.isArray(record.authorizationReadSet) &&
        isAuthorizationReadSet(record.authorizationReadSet)) {
        return hasExactKeys(record, [
            "kind",
            "authorizationDigest",
            "authorizationReadSet",
        ]);
    }
    return record.kind === "hidden" &&
        typeof record.authorizationDigest === "string" &&
        DIGEST_RE.test(record.authorizationDigest) &&
        hasExactKeys(record, ["kind", "authorizationDigest"]);
};
const isAuthorizationReadSet = (value) => {
    const keys = new Set();
    for (const item of value) {
        if (typeof item !== "object" || item === null || Array.isArray(item)) {
            return false;
        }
        const record = item;
        if (!Number.isSafeInteger(record.eid) || record.eid < 0) {
            return false;
        }
        let key;
        if (record.kind === "type" || record.kind === "exists") {
            if (!hasExactKeys(record, ["kind", "eid"]))
                return false;
            key = `${record.kind}:${record.eid}`;
        }
        else if (record.kind === "field" && typeof record.ident === "string" &&
            record.ident.length > 0 && hasExactKeys(record, ["kind", "eid", "ident"])) {
            key = `field:${record.eid}:${record.ident}`;
        }
        else {
            return false;
        }
        if (keys.has(key))
            return false;
        keys.add(key);
    }
    return true;
};
const isFenceEntity = (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const record = value;
    return Number.isSafeInteger(record.eid) && record.eid >= 0 &&
        typeof record.type === "string" && record.type.length > 0 &&
        (record.referenceEid === null ||
            (Number.isSafeInteger(record.referenceEid) &&
                record.referenceEid >= 0)) &&
        isReplayTargetPostCommit(record.postCommit) &&
        hasExactKeys(record, ["eid", "type", "referenceEid", "postCommit"]);
};
const isInvocationReplayFence = (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const record = value;
    if (record.version !== 1 || !Array.isArray(record.consumedRefs) ||
        (record.target !== undefined && !isFenceEntity(record.target)) ||
        !hasExactKeys(record, [
            "version",
            ...(record.target === undefined ? [] : ["target"]),
            "consumedRefs",
        ]))
        return false;
    const paths = new Set();
    for (const item of record.consumedRefs) {
        if (typeof item !== "object" || item === null || Array.isArray(item)) {
            return false;
        }
        const consumed = item;
        if (!Array.isArray(consumed.path) ||
            !consumed.path.every((segment) => (typeof segment === "string" && segment.length > 0) ||
                (typeof segment === "number" &&
                    Number.isSafeInteger(segment) && segment >= 0)) ||
            !Number.isSafeInteger(consumed.eid) || consumed.eid < 0 ||
            typeof consumed.type !== "string" || consumed.type.length === 0 ||
            !hasExactKeys(consumed, ["path", "eid", "type"]))
            return false;
        const key = JSON.stringify(consumed.path);
        if (paths.has(key))
            return false;
        paths.add(key);
    }
    return true;
};
const snapshotInvocationReplayFence = (value) => {
    if (!isInvocationReplayFence(value)) {
        throw new TypeError("completed invocation receipt needs a valid replay fence");
    }
    return Object.freeze({
        version: 1,
        ...(value.target === undefined
            ? {}
            : {
                target: Object.freeze({
                    eid: value.target.eid,
                    type: value.target.type,
                    referenceEid: value.target.referenceEid,
                    postCommit: value.target.postCommit.kind === "absent"
                        ? Object.freeze({
                            kind: "absent",
                            authorizationDigest: value.target.postCommit.authorizationDigest,
                            authorizationReadSet: Object.freeze(value.target.postCommit.authorizationReadSet.map((entry) => Object.freeze({ ...entry }))),
                        })
                        : Object.freeze({ ...value.target.postCommit }),
                }),
            }),
        consumedRefs: Object.freeze(value.consumedRefs.map((ref) => Object.freeze({
            path: Object.freeze([...ref.path]),
            eid: ref.eid,
            type: ref.type,
        }))),
    });
};
const isScope = (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const record = value;
    return typeof record.server === "string" && record.server.length > 0 &&
        typeof record.principal === "string" && record.principal.length > 0 &&
        typeof record.database === "string" && record.database.length > 0 &&
        hasExactKeys(record, ["server", "principal", "database"]);
};
const isAllocationMappings = (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const record = value;
    if (record.version !== 1 || !Array.isArray(record.entries) ||
        typeof record.keyId !== "string" || record.keyId.length === 0 ||
        !isScope(record.scope) ||
        !hasExactKeys(record, ["version", "keyId", "scope", "entries"]))
        return false;
    const slots = new Set();
    const refs = new Set();
    for (const entry of record.entries) {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
            return false;
        }
        const mapping = entry;
        if (!isAllocationSlotName(mapping.slot) || !isClientRef(mapping.clientRef) ||
            typeof mapping.entityId !== "string" || mapping.entityId.length === 0 ||
            mapping.entityId.length > MAX_SEALED_HANDLE_LENGTH ||
            !hasExactKeys(mapping, ["slot", "clientRef", "entityId"]))
            return false;
        if (slots.has(mapping.slot) || refs.has(mapping.clientRef))
            return false;
        slots.add(mapping.slot);
        refs.add(mapping.clientRef);
    }
    return true;
};
const snapshotAllocationMappings = (value) => {
    if (!isAllocationMappings(value)) {
        throw new TypeError("completed invocation receipt has invalid allocation mappings");
    }
    return Object.freeze({
        version: 1,
        keyId: value.keyId,
        scope: Object.freeze({
            server: value.scope.server,
            principal: value.scope.principal,
            database: value.scope.database,
        }),
        entries: Object.freeze(value.entries.map((entry) => Object.freeze({
            slot: entry.slot,
            clientRef: entry.clientRef,
            entityId: entry.entityId,
        }))),
    });
};
export const decideInvocationReceipt = (stored, prepared) => {
    if (stored !== undefined && isLegacyInvocationReceiptRow(stored)) {
        return { _tag: "UpdateRequired" };
    }
    if (stored !== undefined && stored.operationVersion !== prepared.operationVersion) {
        return { _tag: "OperationChanged" };
    }
    if (stored === undefined) {
        return {
            _tag: "Claim",
            receipt: Object.freeze({ ...prepared, status: "claimed" }),
        };
    }
    if (!sameIdentity(stored, prepared))
        return { _tag: "Conflict" };
    if (stored.status === "claimed") {
        return {
            _tag: "Recover",
            receipt: Object.freeze({ ...stored, status: "indeterminate" }),
        };
    }
    return { _tag: "Replay", receipt: stored };
};
export const transitionInvocationReceipt = (receipt, event) => {
    if (receipt.status !== "claimed")
        return receipt;
    switch (event._tag) {
        case "Complete":
            if (!Number.isSafeInteger(event.committedT) || event.committedT < 0) {
                throw new TypeError("completed invocation receipt needs a valid writer position");
            }
            return Object.freeze({
                ...receipt,
                status: "completed",
                committedT: event.committedT,
                output: event.output,
                replayFence: snapshotInvocationReplayFence(event.replayFence),
                ...(event.allocations === undefined ? {} : {
                    allocations: snapshotAllocationMappings(event.allocations),
                }),
            });
        case "Reject":
            return Object.freeze({
                ...receipt,
                status: "rejected",
                rejection: event.rejection,
            });
        case "Fail":
            return Object.freeze({ ...receipt, status: "failed" });
        case "Recover":
            return Object.freeze({ ...receipt, status: "indeterminate" });
    }
};
export const publicInvocationReceipt = (receipt) => Object.freeze({
    version: INVOCATION_RECEIPT_VERSION,
    invocationId: receipt.invocationId,
    status: receipt.status,
});
export const invocationReceiptOutcome = (receipt) => {
    const publicReceipt = publicInvocationReceipt(receipt);
    switch (receipt.status) {
        case "completed":
            return {
                _tag: "Completed",
                receipt: publicReceipt,
                committedT: receipt.committedT,
                output: receipt.output,
                ...(receipt.allocations === undefined ? {} : {
                    mappings: Object.freeze(receipt.allocations.entries.map((entry) => Object.freeze({
                        clientRef: entry.clientRef,
                        entityId: entry.entityId,
                    }))),
                }),
            };
        case "rejected":
            return {
                _tag: "Rejected",
                receipt: publicReceipt,
                rejection: receipt.rejection,
            };
        case "failed":
            return {
                _tag: "Failed",
                receipt: publicReceipt,
            };
        case "indeterminate":
            return {
                _tag: "Indeterminate",
                receipt: publicReceipt,
            };
    }
};
const isIdentity = (value) => value.version === INVOCATION_RECEIPT_VERSION &&
    typeof value.principalId === "string" && value.principalId.length > 0 &&
    typeof value.invocationId === "string" && value.invocationId.length > 0 &&
    typeof value.scopeDigest === "string" && DIGEST_RE.test(value.scopeDigest) &&
    typeof value.operationVersion === "string" &&
    DIGEST_RE.test(value.operationVersion) &&
    typeof value.invocationDigest === "string" &&
    DIGEST_RE.test(value.invocationDigest);
const IDENTITY_KEYS = Object.freeze([
    "version",
    "principalId",
    "invocationId",
    "scopeDigest",
    "operationVersion",
    "invocationDigest",
    "status",
]);
const isRejection = (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const record = value;
    if (record.kind === "unauthorized" || record.kind === "invalid_request" ||
        record.kind === "request_rejected")
        return hasExactKeys(record, ["kind"]);
    return record.kind === "operation_rejected" &&
        typeof record.message === "string" &&
        typeof record.operation === "string" &&
        (record.step === undefined || typeof record.step === "string") &&
        (record.reason === undefined || typeof record.reason === "string") &&
        hasExactKeys(record, [
            "kind",
            "message",
            "operation",
            ...(record.step === undefined ? [] : ["step"]),
            ...(record.reason === undefined ? [] : ["reason"]),
        ]);
};
export const isLegacyInvocationReceiptRow = (value) => value._tag === "LegacyInvocationReceipt";
const isLegacyInvocationReceipt = (record) => typeof record.version === "number" &&
    LEGACY_INVOCATION_RECEIPT_VERSIONS.includes(record.version) &&
    typeof record.principalId === "string" && record.principalId.length > 0 &&
    typeof record.invocationId === "string" && record.invocationId.length > 0 &&
    typeof record.status === "string";
export const parseStoredInvocationReceipt = (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new TypeError("invalid durable invocation receipt");
    }
    const record = value;
    if (isLegacyInvocationReceipt(record)) {
        return Object.freeze({
            _tag: "LegacyInvocationReceipt",
            version: record.version,
        });
    }
    if (!isIdentity(record))
        throw new TypeError("invalid durable invocation receipt");
    if ((record.status === "claimed" || record.status === "failed" ||
        record.status === "indeterminate") &&
        hasExactKeys(record, IDENTITY_KEYS)) {
        return record;
    }
    if (record.status === "completed" &&
        Number.isSafeInteger(record.committedT) && record.committedT >= 0 &&
        Object.hasOwn(record, "output") &&
        isInvocationReplayFence(record.replayFence) &&
        (record.allocations === undefined || isAllocationMappings(record.allocations)) &&
        hasExactKeys(record, [
            ...IDENTITY_KEYS,
            "committedT",
            "output",
            "replayFence",
            ...(record.allocations === undefined ? [] : ["allocations"]),
        ]))
        return record;
    if (record.status === "rejected" && isRejection(record.rejection) &&
        hasExactKeys(record, [...IDENTITY_KEYS, "rejection"])) {
        return record;
    }
    throw new TypeError("invalid durable invocation receipt");
};
const hasPublicReceipt = (value, invocationId, status) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const receipt = value;
    return receipt.version === INVOCATION_RECEIPT_VERSION &&
        receipt.invocationId === invocationId && receipt.status === status &&
        Object.keys(receipt).length === 3;
};
const isPublicMappings = (value) => {
    if (!Array.isArray(value))
        return false;
    const refs = new Set();
    for (const entry of value) {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
            return false;
        }
        const mapping = entry;
        if (!isClientRef(mapping.clientRef) || !isEntityId(mapping.entityId) ||
            !hasExactKeys(mapping, ["clientRef", "entityId"]))
            return false;
        if (refs.has(mapping.clientRef))
            return false;
        refs.add(mapping.clientRef);
    }
    return true;
};
const isOutputRefPaths = (value) => Array.isArray(value) && value.length > 0 && value.every((path) => Array.isArray(path) && path.every((segment) => (typeof segment === "string" && segment.length > 0) ||
    (typeof segment === "number" && Number.isSafeInteger(segment) &&
        segment >= 0)));
export const parseAuthoritativeInvocationResult = (value, invocationId) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new TypeError("invalid authoritative invocation result");
    }
    const result = value;
    if (result._tag === "Conflict" && hasExactKeys(result, ["_tag"]))
        return { _tag: "Conflict" };
    if (result._tag === "OperationChanged" && hasExactKeys(result, ["_tag"]))
        return { _tag: "OperationChanged" };
    if (result._tag === "UpdateRequired" && hasExactKeys(result, ["_tag"]))
        return { _tag: "UpdateRequired" };
    if (result._tag === "Completed" &&
        hasPublicReceipt(result.receipt, invocationId, "completed") &&
        Number.isSafeInteger(result.committedT) && result.committedT >= 0 &&
        Object.hasOwn(result, "output") &&
        (result.mappings === undefined || isPublicMappings(result.mappings)) &&
        (result.outputRefPaths === undefined ||
            isOutputRefPaths(result.outputRefPaths)) &&
        hasExactKeys(result, [
            "_tag",
            "receipt",
            "committedT",
            "output",
            ...(result.mappings === undefined ? [] : ["mappings"]),
            ...(result.outputRefPaths === undefined ? [] : ["outputRefPaths"]),
        ]))
        return result;
    if (result._tag === "Rejected" &&
        hasPublicReceipt(result.receipt, invocationId, "rejected") &&
        isRejection(result.rejection) &&
        hasExactKeys(result, ["_tag", "receipt", "rejection"]))
        return result;
    if (result._tag === "Failed" &&
        hasPublicReceipt(result.receipt, invocationId, "failed") &&
        hasExactKeys(result, ["_tag", "receipt"]))
        return result;
    if (result._tag === "Indeterminate" &&
        hasPublicReceipt(result.receipt, invocationId, "indeterminate") &&
        hasExactKeys(result, ["_tag", "receipt"]))
        return result;
    throw new TypeError("invalid authoritative invocation result");
};
//# sourceMappingURL=invocation-receipts.js.map