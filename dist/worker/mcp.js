import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { executeAuthorizedGraphPathTarget, } from "../internal/authorization/index.js";
import { decodeOperationVersionToken, parseAt, parseMutateArgs, parseQueryDocument, requireArgs, toolFailure, } from "../mcp/contract.js";
import { describeGraph, publicMutateResult, runQueryDocument } from "../mcp/kernel.js";
import { acquireCurrentDb, provisionResolvedDatabase, queryMaxCells } from "./authorized-read.js";
import { invokeAuthoritativeOperation } from "./authorized-operation.js";
import { Internal, OperationRejected, UpstreamError, Unauthorized } from "./errors.js";
const inaccessible = () => toolFailure("inaccessible", "nothing addressable is available there");
class ToolBodyFailure {
    cause;
    constructor(cause) {
        this.cause = cause;
    }
}
const withAuthorizedTarget = async (input, at, use) => {
    let resolved;
    try {
        resolved = await Effect.runPromise(executeAuthorizedGraphPathTarget({
            authenticate: Effect.succeed(input.caller),
            bindings: input.bindings,
            root: input.root,
            path: at,
            currentDb: acquireCurrentDb(input.env, input.request, {
                bypassBasisCache: true,
                authoritativeBasisFence: true,
            }),
            provision: (route, derivation) => provisionResolvedDatabase(input.env, route, derivation),
        }, (target) => Effect.tryPromise({
            try: () => use(target),
            catch: (cause) => new ToolBodyFailure(cause),
        })).pipe(Effect.result));
    }
    catch {
        throw toolFailure("internal_error", "the graph could not be read");
    }
    if (Result.isSuccess(resolved))
        return resolved.success;
    if (resolved.failure instanceof ToolBodyFailure)
        throw resolved.failure.cause;
    throw inaccessible();
};
const mutateTransportFailure = (cause) => {
    if (cause instanceof OperationRejected) {
        throw toolFailure("operation_rejected", cause.message);
    }
    if (cause instanceof Unauthorized)
        throw inaccessible();
    if (cause instanceof UpstreamError) {
        if (cause.status === 401 || cause.status === 403)
            throw inaccessible();
        if (cause.status === 400) {
            throw toolFailure("invalid_input", "the operation refused this input");
        }
        if (cause.status === 409) {
            throw toolFailure("operation_rejected", "the operation refused the request");
        }
    }
    throw toolFailure("internal_error", "the operation could not be invoked");
};
const mcpTools = (input) => ({
    describe: (raw) => {
        const args = requireArgs(raw ?? {});
        const at = parseAt(args.at);
        return withAuthorizedTarget(input, at, (target) => describeGraph(target.context, input.caller, at));
    },
    query: (raw) => {
        const args = requireArgs(raw);
        const at = parseAt(args.at);
        const document = parseQueryDocument(args.query);
        return withAuthorizedTarget(input, at, (target) => runQueryDocument(target.context, input.caller, document, {
            maxCells: queryMaxCells(input.env),
        }));
    },
    mutate: async (raw) => {
        const args = parseMutateArgs(raw);
        const operationVersion = decodeOperationVersionToken(args.operation.version);
        const resolved = await withAuthorizedTarget(input, args.at, (target) => {
            const descriptor = target.context.unit.catalog.operations.find((candidate) => candidate.id.owner.kind === args.operation.owner.kind &&
                candidate.id.owner.name === args.operation.owner.name &&
                candidate.id.localName === args.operation.name);
            if (descriptor === undefined)
                throw inaccessible();
            return Promise.resolve({
                output: descriptor.output,
                route: target.route,
                derivation: target.derivation,
            });
        });
        const result = await invokeAuthoritativeOperation(input.env, resolved.route.database, new URL(input.request.url).origin, {
            catalogKey: resolved.route.deployed.catalogKey,
            unitHash: resolved.route.deployed.unitHash,
            owner: args.operation.owner,
            localName: args.operation.name,
            invocationId: args.invocationId,
            operationVersion,
            input: args.input,
        }, input.caller, resolved.derivation).catch(mutateTransportFailure);
        await input.boundaries?.checkpoint("operation.response");
        if (!Number.isSafeInteger(input.caller.exp) ||
            input.caller.exp * 1_000 <= Date.now()) {
            throw toolFailure("invocation_indeterminate", "authorization expired before this result could be returned; " +
                "reauthenticate and retry with the same invocationId");
        }
        const projected = publicMutateResult(result, resolved.output);
        if ("code" in projected)
            throw toolFailure(projected.code, projected.message);
        return projected;
    },
});
export const mcpResponse = (input) => Effect.tryPromise({
    try: async () => {
        const { handleMcpRequest } = await import("../mcp/server.js");
        const response = await handleMcpRequest(input.request, mcpTools(input));
        const headers = new Headers(response.headers);
        for (const [name, value] of Object.entries(input.headers)) {
            headers.set(name, value);
        }
        return new Response(response.body, { status: response.status, headers });
    },
    catch: (cause) => new Internal({
        message: cause instanceof Error ? cause.message : String(cause),
    }),
});
//# sourceMappingURL=mcp.js.map