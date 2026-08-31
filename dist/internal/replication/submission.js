import { isClientRef, isEntityId, } from "../../db/refs.js";
import { isLeadershipKey } from "./leadership.js";
import { mappingKey, } from "./outbox.js";
const writeAtPath = (value, path, replacement) => {
    const [head, ...rest] = path;
    if (head === undefined)
        return replacement;
    if (typeof head === "number") {
        if (!Array.isArray(value) || head >= value.length) {
            throw new TypeError("declared input position is not an array index");
        }
        const copy = [...value];
        copy[head] = writeAtPath(value[head], rest, replacement);
        return copy;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new TypeError("declared input position is not an object property");
    }
    const record = value;
    if (!Object.hasOwn(record, head)) {
        throw new TypeError("declared input position is absent");
    }
    return { ...record, [head]: writeAtPath(record[head], rest, replacement) };
};
export const substituteMutationRefs = (record, handles) => {
    const resolve = (ref) => handles.get(mappingKey(record.partition, ref));
    let target;
    if (record.target.type === "entity") {
        target = record.target.entityId;
    }
    else if (record.target.type === "client-ref") {
        target = resolve(record.target.clientRef);
        if (target === undefined)
            return undefined;
    }
    let input = record.input;
    for (const use of record.inputRefs) {
        if (!isClientRef(use.ref))
            continue;
        const handle = resolve(use.ref);
        if (handle === undefined)
            return undefined;
        input = writeAtPath(input, use.path, handle);
    }
    return Object.freeze({ target, input });
};
export const buildMutationRequest = (record, endpoint, substituted) => Object.freeze({
    endpoint,
    body: Object.freeze({
        ...(endpoint.graphPath.length === 0
            ? {}
            : { at: [...endpoint.graphPath] }),
        invocationId: record.invocation,
        operationVersion: record.operationVersion,
        operation: {
            owner: { kind: record.operation.owner.kind, name: record.operation.owner.name },
            localName: record.operation.localName,
        },
        ...(substituted.target === undefined ? {} : { target: substituted.target }),
        ...(record.allocations.length === 0 ? {} : {
            allocations: record.allocations.map((allocation) => ({
                slot: allocation.slot,
                clientRef: allocation.clientRef,
            })),
        }),
        input: substituted.input,
    }),
});
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const RETRY = (reason) => Object.freeze({ _tag: "Retry", reason });
const REJECTED = (code) => Object.freeze({ _tag: "Rejected", code });
const readMappings = (record, value) => {
    const expected = new Set(record.allocations.map((allocation) => allocation.clientRef));
    if (value === undefined)
        return expected.size === 0 ? [] : undefined;
    if (!Array.isArray(value) || value.length !== expected.size)
        return undefined;
    const mappings = [];
    for (const entry of value) {
        if (!isRecord(entry))
            return undefined;
        if (!isClientRef(entry.clientRef) || !isEntityId(entry.entityId))
            return undefined;
        if (!expected.delete(entry.clientRef))
            return undefined;
        mappings.push(Object.freeze({ clientRef: entry.clientRef, entityId: entry.entityId }));
    }
    return expected.size === 0 ? Object.freeze(mappings) : undefined;
};
const RECEIPT_VERSION = 2;
const hasReceipt = (record, body, states) => {
    const receipt = body?.receipt;
    if (!isRecord(receipt))
        return false;
    return receipt.version === RECEIPT_VERSION &&
        receipt.invocationId === record.invocation &&
        typeof receipt.status === "string" && states.includes(receipt.status);
};
const rejectionCode = (status, body) => {
    if (typeof body?.code === "string")
        return body.code;
    // An `OperationRejected` body carries the body's own `reason`, and that is the
    // only part of a rejection a caller can act on: two rejections from the same
    // operation are told apart by it and nothing else. Collapsing every one to
    // `"operation_rejected"` left an application unable to distinguish, say, a
    // stale head from a duplicate entity, so the reason is preferred when present.
    //
    // Read here rather than mirrored into `code` on the wire: `code` carries
    // protocol outcomes (`invocation_conflict`, `operation_changed`), and a domain
    // reason is not one of those.
    if (body?.tag === "OperationRejected") {
        return typeof body.reason === "string" ? body.reason : "operation_rejected";
    }
    if (status === 400)
        return "invalid_request";
    if (status === 401 || status === 403)
        return "unauthorized";
    return "request_rejected";
};
export const classifyMutationResponse = (record, response) => {
    if (response._tag === "Unreachable")
        return RETRY("unreachable");
    const { status } = response;
    const body = isRecord(response.body) ? response.body : undefined;
    const code = typeof body?.code === "string" ? body.code : undefined;
    if (status === 200) {
        if (body === undefined)
            return RETRY("malformed");
        if (!hasReceipt(record, body, ["completed"]))
            return RETRY("malformed");
        const mappings = readMappings(record, body.mappings);
        if (mappings === undefined)
            return RETRY("malformed");
        if (!Object.hasOwn(body, "result"))
            return RETRY("malformed");
        return Object.freeze({
            _tag: "Committed",
            output: body.result,
            mappings,
        });
    }
    if (status === 409) {
        switch (code) {
            case "operation_changed":
                return Object.freeze({
                    _tag: "UpdateRequired",
                    reason: "operation-changed",
                });
            case "invocation_update_required":
                return Object.freeze({
                    _tag: "UpdateRequired",
                    reason: "invocation-update-required",
                });
            case "invocation_indeterminate":
                return RETRY("indeterminate");
            case "invocation_conflict":
                return REJECTED("invocation_conflict");
        }
    }
    if (hasReceipt(record, body, ["rejected", "failed"])) {
        return REJECTED(rejectionCode(status, body));
    }
    if (status === 409 && body?.receipt === undefined) {
        return Object.freeze({ _tag: "Refused", code });
    }
    if (status === 429 || status >= 500)
        return RETRY("unavailable");
    return RETRY("malformed");
};
export const interruptedReason = (error) => {
    const tag = error?._tag;
    switch (tag) {
        case "ReplicaFencedError":
            return isLeadershipKey(String(error.key))
                ? "leadership-fenced"
                : "scope-fenced";
        case "ReplicaScopeClearedError":
            return "scope-fenced";
        case "ReplicaScopeUnconfirmedError":
            return "scope-unconfirmed";
        case "OutboxInvocationConflict":
        case "ClientRefConflict":
            return "invocation-conflict";
        case "ClientRefMappingRefused":
            return "mapping-refused";
        case "OutboxRecordInvalid":
            return "record-invalid";
    }
    return error?.name === "AbortError"
        ? "aborted"
        : "storage";
};
const progress = (partition, receiver, state) => Object.freeze({ partition, receiver, state });
export const runSubmissionPass = async (pass) => {
    const { plans, handles } = await pass.store.submissionPlan(pass.scope, pass.keyId);
    const settled = await Promise.allSettled(plans.map(async (plan) => {
        const { head, partition, receiver } = plan;
        switch (head.type) {
            case "empty":
                return progress(partition, receiver, { _tag: "Empty" });
            case "blocked":
                return progress(partition, receiver, {
                    _tag: "Blocked",
                    missing: head.missing,
                });
            case "update-required":
                return progress(partition, receiver, {
                    _tag: "UpdateRequired",
                    invocation: head.record.invocation,
                    reason: head.reason,
                });
            case "unreadable":
                return progress(partition, receiver, {
                    _tag: "Unreadable",
                    sequence: head.sequence,
                });
            case "ready":
                return submitHead(pass, plan.receiver, head.record, handles);
        }
    }));
    return Object.freeze(settled.map((outcome, index) => {
        if (outcome.status === "fulfilled")
            return outcome.value;
        const plan = plans[index];
        return progress(plan.partition, plan.receiver, {
            _tag: "Interrupted",
            reason: interruptedReason(outcome.reason),
        });
    }));
};
const submitHead = async (pass, receiver, record, handles) => {
    const endpoint = pass.endpoints(receiver);
    if (endpoint === undefined) {
        return progress(record.partition, receiver, { _tag: "Offline" });
    }
    const substituted = substituteMutationRefs(record, handles);
    if (substituted === undefined) {
        return progress(record.partition, receiver, {
            _tag: "Blocked",
            missing: Object.freeze([]),
        });
    }
    const response = await pass.transport(buildMutationRequest(record, endpoint, substituted), pass.signal);
    const acknowledgement = classifyMutationResponse(record, response);
    switch (acknowledgement._tag) {
        case "Committed":
            await pass.store.acknowledge(record, acknowledgement);
            return progress(record.partition, receiver, {
                _tag: "Committed",
                invocation: record.invocation,
            });
        case "Rejected":
            await pass.store.acknowledge(record, acknowledgement);
            return progress(record.partition, receiver, {
                _tag: "Rejected",
                invocation: record.invocation,
                code: acknowledgement.code,
            });
        case "Refused":
            return progress(record.partition, receiver, {
                _tag: "Refused",
                invocation: record.invocation,
                code: acknowledgement.code,
            });
        case "UpdateRequired":
            return progress(record.partition, receiver, {
                _tag: "UpdateRequired",
                invocation: record.invocation,
                reason: acknowledgement.reason,
            });
        case "Retry":
            return progress(record.partition, receiver, {
                _tag: "Retry",
                invocation: record.invocation,
                reason: acknowledgement.reason,
            });
    }
};
//# sourceMappingURL=submission.js.map