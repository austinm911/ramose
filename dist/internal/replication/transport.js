import * as Result from "effect/Result";
import { localDigest } from "./digest.js";
import { MAX_REPLICATION_FRAME_BYTES, REPLICATION_PROTOCOL_VERSION, decodeReplicationFrame, encodeActivationRequest, } from "./protocol.js";
const CREDENTIAL_BINDING_DOMAIN = "ramose:replication:credential-binding:v2";
const CACHE_SELECTOR_DOMAIN = "ramose:replication:cache-selector:v1";
const NDJSON_CONTENT_TYPE = "application/x-ndjson";
export class ReplicationTransportError extends Error {
    name = "ReplicationTransportError";
}
export class ReplicationUnauthorizedError extends ReplicationTransportError {
    name = "ReplicationUnauthorizedError";
}
const fail = (message) => {
    throw new ReplicationTransportError(message);
};
const localhost = (url) => url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
export const replicationActivationAddress = (input) => {
    const server = new URL(input.server);
    if (server.username !== "" || server.password !== "") {
        return fail("replication server URL must not contain credentials");
    }
    if ((server.pathname !== "" && server.pathname !== "/") ||
        server.search !== "" || server.hash !== "") {
        return fail("replication server URL must be an origin");
    }
    if (server.protocol !== "https:" && !(server.protocol === "http:" && localhost(server))) {
        return fail("replication requires HTTPS outside localhost");
    }
    if (input.root.length === 0 || input.root.includes("/")) {
        return fail("replication root must be one non-empty database name");
    }
    const graphPath = Object.freeze([...input.graphPath]);
    const origin = server.origin;
    return Object.freeze({
        origin,
        root: input.root,
        graphPath,
        endpoint: `${origin}/db/${encodeURIComponent(input.root)}/replicate`,
    });
};
export const replicationCredentialFingerprint = async (credential, activation, routeSlot) => localDigest({
    domain: CREDENTIAL_BINDING_DOMAIN,
    credential,
    activation: {
        origin: activation.origin,
        root: activation.root,
        routeSlot,
    },
});
export const replicationCacheSelector = async (cacheKey, activation) => localDigest({
    domain: CACHE_SELECTOR_DOMAIN,
    cacheKey,
    origin: activation.origin,
    root: activation.root,
});
export const openReplicationResponse = (input) => fetch(input.activation.endpoint, {
    method: "POST",
    redirect: "error",
    headers: {
        authorization: `Bearer ${input.credential}`,
        accept: NDJSON_CONTENT_TYPE,
        "content-type": "application/json",
    },
    body: encodeActivationRequest({
        type: "Activate",
        protocol: REPLICATION_PROTOCOL_VERSION,
        graphPath: input.activation.graphPath,
        scope: { type: "database" },
        readCompatibilityHash: input.readCompatibilityHash,
        ...(input.resumeRevision === undefined
            ? {}
            : { resumeRevision: input.resumeRevision }),
    }),
    signal: input.signal,
});
const validateResponse = (response) => {
    if (response.status === 401 || response.status === 403) {
        throw new ReplicationUnauthorizedError("replication credential was refused");
    }
    if (response.status !== 200 && response.status !== 409) {
        fail("replication response was not successful");
    }
    const contentType = response.headers.get("content-type")
        ?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== NDJSON_CONTENT_TYPE)
        fail("replication response has the wrong content type");
    const cacheControl = response.headers.get("cache-control")
        ?.split(",").map((part) => part.trim().toLowerCase()) ?? [];
    if (!cacheControl.includes("no-store"))
        fail("replication response is cacheable");
};
const concat = (left, right) => {
    const joined = new Uint8Array(left.byteLength + right.byteLength);
    joined.set(left);
    joined.set(right, left.byteLength);
    return joined;
};
const decodeLine = (bytes) => {
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_REPLICATION_FRAME_BYTES) {
        return fail("replication frame is empty or oversized");
    }
    let text;
    try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
    catch {
        return fail("replication frame is not valid UTF-8");
    }
    const decoded = decodeReplicationFrame(text);
    if (Result.isFailure(decoded))
        throw decoded.failure;
    return decoded.success;
};
export async function* readReplicationFrames(response, signal) {
    validateResponse(response);
    const body = response.body;
    if (body === null)
        return fail("replication response has no body");
    const reader = body.getReader();
    const chunks = (async function* () {
        for (;;) {
            signal?.throwIfAborted();
            const next = await reader.read();
            if (next.done)
                return;
            yield next.value;
        }
    })();
    try {
        const decoded = decodeReplicationNdjson(chunks, signal);
        if (response.status === 409) {
            let terminal;
            for await (const frame of decoded) {
                if (terminal !== undefined) {
                    fail("replication conflict must contain exactly one allowed terminal frame");
                }
                if (frame.type !== "TerminalError" || !("code" in frame)) {
                    fail("replication conflict must contain exactly one allowed terminal frame");
                }
                const candidate = frame;
                if (candidate.identity !== undefined || candidate.code === "closed") {
                    fail("replication conflict must contain exactly one allowed terminal frame");
                }
                terminal = candidate;
            }
            if (terminal === undefined) {
                fail("replication conflict must contain exactly one allowed terminal frame");
            }
            yield terminal;
            return;
        }
        yield* decoded;
    }
    finally {
        try {
            await reader.cancel();
        }
        catch {
        }
        finally {
            reader.releaseLock();
        }
    }
}
export const submitMutation = async (request, signal) => {
    const { endpoint } = request;
    let response;
    try {
        response = await fetch(`${endpoint.origin}/db/${encodeURIComponent(endpoint.database)}/op`, {
            method: "POST",
            redirect: "error",
            headers: {
                authorization: `Bearer ${endpoint.credential}`,
                accept: "application/json",
                "content-type": "application/json",
            },
            body: JSON.stringify(request.body),
            ...(signal === undefined ? {} : { signal }),
        });
    }
    catch {
        return { _tag: "Unreachable" };
    }
    let body;
    try {
        body = await response.json();
    }
    catch {
        body = undefined;
    }
    return { _tag: "Response", status: response.status, body };
};
export async function* decodeReplicationNdjson(chunks, signal) {
    let pending = new Uint8Array();
    for await (const chunk of chunks) {
        signal?.throwIfAborted();
        let start = 0;
        for (let index = 0; index < chunk.byteLength; index++) {
            if (chunk[index] !== 0x0a)
                continue;
            const part = chunk.subarray(start, index);
            const line = pending.byteLength === 0 ? part : concat(pending, part);
            pending = new Uint8Array();
            start = index + 1;
            yield decodeLine(line);
        }
        const remainder = chunk.subarray(start);
        if (remainder.byteLength > 0) {
            pending = pending.byteLength === 0 ? remainder.slice() : concat(pending, remainder);
            if (pending.byteLength > MAX_REPLICATION_FRAME_BYTES) {
                fail("replication frame is oversized");
            }
        }
    }
    if (pending.byteLength !== 0)
        fail("replication stream ended without a newline");
}
//# sourceMappingURL=transport.js.map