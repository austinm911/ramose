import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { DatabaseId, MAX_INVOCATION_ID_LENGTH, mayCarrySealedEntityId, OperationVersion, parseAuthoritativeInvocationResult, parseInvocationAllocations, sealOutputEntityRefs, } from "../internal/authorization/index.js";
import { fromJson, toJson } from "../internal/core/json.js";
import { makeEntityIdScope } from "../internal/replication/identity.js";
import { internalHeaders } from "../internal/transactor/index.js";
import { serverSealingKey } from "./server-identity.js";
import { BadRequest, OperationRejected, Unauthorized, UpstreamError, } from "./errors.js";
import { isEntityRef, parseGraphPath, refuseCatalogProof, } from "./authorized-read.js";
import { invalidateBasis } from "./peer.js";
export const serializeOperationInvocation = (invocation) => {
    const wireInvocation = {
        ...invocation,
        ...(invocation.target === undefined
            ? {}
            : { target: toJson(invocation.target) }),
    };
    return JSON.stringify({ invocation: wireInvocation });
};
const bad = (message) => new BadRequest({ message });
const deny = () => new Unauthorized({ status: 403 });
const readOperationJsonObject = (request) => Effect.tryPromise({
    try: async () => {
        const text = await request.text();
        if (text.trim().length === 0)
            throw bad("body must be a JSON object");
        const value = JSON.parse(text);
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
            throw bad("body must be a JSON object");
        }
        return value;
    },
    catch: (cause) => cause instanceof BadRequest ? cause : bad("body must be a JSON object"),
});
const privateFailure = (status = 500, headers) => new UpstreamError({
    status,
    body: JSON.stringify({ error: "operation execution failed" }),
    ...(headers === undefined ? {} : { headers }),
});
const operationRejectedOf = (text) => {
    try {
        const body = JSON.parse(text);
        if (body.tag !== "OperationRejected" ||
            typeof body.message !== "string" ||
            typeof body.operation !== "string")
            return undefined;
        return new OperationRejected({
            message: body.message,
            operation: body.operation,
            ...(typeof body.step === "string" ? { step: body.step } : {}),
            ...(typeof body.reason === "string" ? { reason: body.reason } : {}),
        });
    }
    catch {
        return undefined;
    }
};
export const operationFailureFromResponse = (response, text) => {
    if (response.status === 409) {
        return operationRejectedOf(text) ?? privateFailure(409);
    }
    if (response.status === 503) {
        const retryAfter = response.headers.get("retry-after");
        return privateFailure(503, retryAfter === null ? undefined : { "retry-after": retryAfter });
    }
    return privateFailure(response.status >= 500 ? 500 : response.status);
};
const parseOwner = (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return Result.fail(bad("operation.owner must be { kind, name }"));
    }
    const owner = value;
    if ((owner.kind !== "entity" && owner.kind !== "trait") ||
        typeof owner.name !== "string" || owner.name.length === 0) {
        return Result.fail(bad("operation.owner must be { kind: entity|trait, name }"));
    }
    return Result.succeed({ kind: owner.kind, name: owner.name });
};
export const parseOperationRequest = Effect.fn("parseOperationRequest")(function* (request) {
    const body = yield* readOperationJsonObject(request);
    const path = yield* Effect.fromResult(parseGraphPath(body, new URL(request.url).searchParams));
    yield* Effect.fromResult(refuseCatalogProof(body, request.headers)).pipe(Effect.mapError(() => deny()));
    const operation = body.operation;
    if (typeof operation !== "object" || operation === null || Array.isArray(operation)) {
        return yield* bad("body.operation must be { owner, localName }");
    }
    const record = operation;
    const owner = yield* Effect.fromResult(parseOwner(record.owner));
    if (typeof record.localName !== "string" || record.localName.length === 0) {
        return yield* bad("operation.localName must be a non-empty string");
    }
    if (typeof body.invocationId !== "string" || body.invocationId.length === 0 ||
        body.invocationId.length > MAX_INVOCATION_ID_LENGTH) {
        return yield* bad(`invocationId must be a non-empty string of at most ${MAX_INVOCATION_ID_LENGTH} characters`);
    }
    if (body.operationVersion !== undefined &&
        (typeof body.operationVersion !== "string" ||
            !/^[0-9a-f]{64}$/.test(body.operationVersion))) {
        return yield* bad("operationVersion must be a canonical operation version digest");
    }
    const sealedTarget = typeof body.target === "string" ? body.target : undefined;
    const target = body.target === undefined || sealedTarget !== undefined
        ? undefined
        : fromJson(body.target);
    if (target !== undefined &&
        !(typeof target === "number" && Number.isSafeInteger(target) && target >= 0) &&
        !(Array.isArray(target) && isEntityRef(target))) {
        return yield* bad("operation target must be an entity id, an eid, or a lookup ref");
    }
    const allocations = parseInvocationAllocations(body.allocations);
    if (allocations === undefined) {
        return yield* bad("allocations must be unique { slot, clientRef } pairs");
    }
    return {
        path,
        owner,
        localName: record.localName,
        invocationId: body.invocationId,
        ...(body.operationVersion === undefined ? {} : {
            operationVersion: OperationVersion.make(body.operationVersion),
        }),
        ...(target === undefined ? {} : {
            target: target,
        }),
        ...(sealedTarget === undefined ? {} : { sealedTarget }),
        ...(allocations.length === 0 ? {} : { allocations }),
        input: body.input,
    };
});
const deriveEntityIdScope = async (env, database, origin, caller) => {
    let sealing;
    try {
        sealing = await serverSealingKey(env);
    }
    catch {
        throw privateFailure(503, { "retry-after": "1" });
    }
    return {
        sealing,
        scope: await makeEntityIdScope(sealing, {
            origin,
            caller,
            database: DatabaseId.make(database),
        }),
    };
};
const invocationEntityIdScope = async (env, database, origin, parsed, caller) => {
    if (parsed.sealedTarget === undefined &&
        (parsed.allocations === undefined || parsed.allocations.length === 0) &&
        !mayCarrySealedEntityId(parsed.input))
        return undefined;
    return deriveEntityIdScope(env, database, origin, caller);
};
const sealPublicEntityRefs = async (env, database, origin, caller, derived, result) => {
    if (result._tag !== "Completed")
        return result;
    const { outputRefPaths, ...projected } = result;
    if (outputRefPaths === undefined || outputRefPaths.length === 0) {
        return projected;
    }
    const bound = derived ??
        await deriveEntityIdScope(env, database, origin, caller);
    try {
        return {
            ...projected,
            output: await sealOutputEntityRefs(bound.sealing, bound.scope, result.output, outputRefPaths),
        };
    }
    catch {
        throw privateFailure();
    }
};
export const invokeAuthoritativeOperation = async (env, database, origin, parsed, caller, routeDerivation) => {
    const sealingScope = await invocationEntityIdScope(env, database, origin, parsed, caller);
    const invocation = {
        ...parsed,
        database: DatabaseId.make(database),
        caller,
        ...(sealingScope === undefined ? {} : {
            entityIdScope: sealingScope.scope,
            entityIdKeyId: sealingScope.sealing.keyId,
        }),
        ...(routeDerivation === undefined ? {} : { routeDerivation }),
    };
    const stub = env.TRANSACTOR.get(env.TRANSACTOR.idFromName(database));
    let response;
    let text;
    try {
        response = await stub.fetch(`https://transactor/invoke?db=${encodeURIComponent(database)}`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                ...internalHeaders(env),
            },
            body: serializeOperationInvocation(invocation),
        });
        text = await response.text();
    }
    catch {
        throw privateFailure();
    }
    if (!response.ok) {
        throw operationFailureFromResponse(response, text);
    }
    let result;
    try {
        result = parseAuthoritativeInvocationResult(JSON.parse(text), invocation.invocationId);
    }
    catch {
        throw new UpstreamError({
            status: 502,
            body: JSON.stringify({ error: "transactor returned an invalid operation result" }),
        });
    }
    if (result._tag === "Completed")
        invalidateBasis(database);
    return sealPublicEntityRefs(env, database, origin, caller, sealingScope, result);
};
export const publicOperationResult = (result) => {
    if (result._tag === "Conflict") {
        return {
            status: 409,
            body: { error: "request rejected", code: "invocation_conflict" },
        };
    }
    if (result._tag === "OperationChanged") {
        return {
            status: 409,
            body: { error: "request rejected", code: "operation_changed" },
        };
    }
    if (result._tag === "UpdateRequired") {
        return {
            status: 409,
            body: { error: "request rejected", code: "invocation_update_required" },
        };
    }
    if (result._tag === "Completed") {
        return {
            status: 200,
            body: {
                result: result.output,
                receipt: result.receipt,
                ...(result.mappings === undefined ? {} : { mappings: result.mappings }),
            },
        };
    }
    if (result._tag === "Failed") {
        return {
            status: 500,
            body: {
                error: "internal error",
                code: "invocation_failed",
                receipt: result.receipt,
            },
        };
    }
    if (result._tag === "Indeterminate") {
        return {
            status: 409,
            body: {
                error: "request state is indeterminate",
                code: "invocation_indeterminate",
                receipt: result.receipt,
            },
        };
    }
    switch (result.rejection.kind) {
        case "unauthorized":
            return {
                status: 403,
                body: { error: "unauthorized", receipt: result.receipt },
            };
        case "invalid_request":
            return {
                status: 400,
                body: { error: "invalid request", receipt: result.receipt },
            };
        case "request_rejected":
            return {
                status: 409,
                body: { error: "request rejected", receipt: result.receipt },
            };
        case "operation_rejected":
            return {
                status: 409,
                body: {
                    error: result.rejection.message,
                    tag: "OperationRejected",
                    message: result.rejection.message,
                    operation: result.rejection.operation,
                    ...(result.rejection.step === undefined
                        ? {}
                        : { step: result.rejection.step }),
                    ...(result.rejection.reason === undefined
                        ? {}
                        : { reason: result.rejection.reason }),
                    receipt: result.receipt,
                },
            };
    }
};
//# sourceMappingURL=authorized-operation.js.map