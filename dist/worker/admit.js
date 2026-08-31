import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import {} from "./auth.js";
import { Unauthorized } from "./errors.js";
import { JwtVerifier } from "./jwt.js";
const unauthorized = () => new Unauthorized({});
const bearer = (authorization) => {
    if (authorization === null)
        return Result.fail(unauthorized());
    const match = /^Bearer[ \t]+([^,\s]+)$/i.exec(authorization);
    return match === null
        ? Result.fail(unauthorized())
        : Result.succeed(Redacted.make(match[1]));
};
const isWebSocketUpgrade = (request) => request.headers.get("upgrade")?.trim().toLowerCase() === "websocket";
const isWebSocketSession = (request, url) => request.method === "GET" &&
    isWebSocketUpgrade(request) &&
    /^\/db\/[^/]+\/session$/.test(url.pathname);
export const requestCredential = (request) => {
    const url = new URL(request.url);
    const authorization = request.headers.get("authorization");
    if (!isWebSocketSession(request, url)) {
        if (url.searchParams.has("token"))
            return Result.fail(unauthorized());
        return bearer(authorization);
    }
    if (authorization !== null)
        return bearer(authorization);
    const queryTokens = url.searchParams.getAll("token");
    if (queryTokens.length !== 1 ||
        queryTokens[0].length === 0 ||
        /\s/.test(queryTokens[0])) {
        return Result.fail(unauthorized());
    }
    return Result.succeed(Redacted.make(queryTokens[0]));
};
export const authenticateRequest = Effect.fn("authenticateRequest")(function* (request) {
    const token = yield* Effect.fromResult(requestCredential(request));
    const verifier = yield* JwtVerifier;
    return yield* verifier.verify(token);
});
//# sourceMappingURL=admit.js.map