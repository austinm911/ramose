import * as Data from "effect/Data";
import { InvalidRequest, OperationRejected, TxRejected, Unauthorized, } from "../../db/Errors.js";
import { TxError } from "../core/index.js";
export { TxRejected };
export class TransactorDeadError extends Error {
    constructor(reason) {
        super(`transactor aborted: ${reason}`);
    }
}
export class TransactorDead extends Data.TaggedError("TransactorDead") {
}
export class Unavailable extends Data.TaggedError("Unavailable") {
}
export class BadRequest extends Data.TaggedError("BadRequest") {
}
export class NotFound extends Data.TaggedError("NotFound") {
}
export class Internal extends Data.TaggedError("Internal") {
}
const TAGS = {
    TxRejected: 409,
    Unauthorized: 401,
    OperationRejected: 409,
    TransactorDead: 503,
    Unavailable: 503,
    BadRequest: 400,
    NotFound: 404,
    Internal: 500,
};
export function toHttpError(err) {
    if (err instanceof TxRejected || err instanceof Unauthorized ||
        err instanceof OperationRejected || err instanceof TransactorDead ||
        err instanceof BadRequest || err instanceof NotFound || err instanceof Internal ||
        err instanceof Unavailable)
        return err;
    if (err instanceof InvalidRequest)
        return new BadRequest({ message: err.message });
    if (err instanceof TxError)
        return new TxRejected({ message: err.message, code: err.code });
    if (err instanceof TransactorDeadError)
        return new TransactorDead({ message: err.message, retryAfterMs: 0 });
    return new Internal({ message: err instanceof Error ? err.message : String(err) });
}
export const statusOf = (e) => e._tag === "Unauthorized" ? (e.status ?? 401) : TAGS[e._tag];
export function errorResponse(e) {
    const body = { error: e.message, tag: e._tag, message: e.message };
    const headers = { "content-type": "application/json" };
    if (e._tag === "TxRejected") {
        body.code = e.code;
        if (e.attr !== undefined)
            body.attr = e.attr;
    }
    if (e._tag === "TransactorDead" || e._tag === "Unavailable") {
        body.retryAfterMs = e.retryAfterMs;
        headers["retry-after"] = String(Math.ceil(e.retryAfterMs / 1000));
    }
    if (e._tag === "OperationRejected") {
        body.operation = e.operation;
        if (e.step !== undefined)
            body.step = e.step;
        if (e.reason !== undefined)
            body.reason = e.reason;
    }
    return new Response(JSON.stringify(body), { status: statusOf(e), headers });
}
//# sourceMappingURL=errors.js.map