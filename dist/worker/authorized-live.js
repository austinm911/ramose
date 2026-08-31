import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { Unauthorized } from "../db/Errors.js";
import { executeAuthorizedLive, executeAuthorizedRead, OneShotReadError, } from "../internal/authorization/index.js";
import { stringifyJson } from "../internal/core/json.js";
const encoder = new TextEncoder();
const encodeDiff = (diff) => encoder.encode(`${stringifyJson(diff)}\n`);
export const liveNdjsonStream = (input, read, opts, context) => liveDiffNdjsonStream(executeAuthorizedLive(input, read, opts), context);
export const liveDiffNdjsonStream = (stream, context) => Stream.toReadableStreamWith(stream.pipe(Stream.map(encodeDiff), Stream.catchCause(() => Stream.empty)), context);
export const liveResponseFromStream = (stream, headers) => Effect.gen(function* () {
    const context = yield* Effect.context();
    const body = liveDiffNdjsonStream(stream, context);
    return new Response(body, {
        status: 200,
        headers: {
            "content-type": "application/x-ndjson",
            "cache-control": "no-store",
            ...headers,
        },
    });
});
export const authorizedLiveResponse = (input, read, opts, headers) => Effect.gen(function* () {
    yield* executeAuthorizedRead(input.admissionCurrentDb === undefined
        ? input
        : { ...input, currentDb: input.admissionCurrentDb }, read, opts);
    return yield* liveResponseFromStream(executeAuthorizedLive(input, read, opts), headers);
});
//# sourceMappingURL=authorized-live.js.map