import * as Data from "effect/Data";
import { QueryBudgetError } from "../core/index.js";
export class QueryBudget extends Data.TaggedError("QueryBudget") {
}
export class BadRequest extends Data.TaggedError("BadRequest") {
}
export class Internal extends Data.TaggedError("Internal") {
}
const CLIENT_ERROR = /unknown attribute|not bound|insufficient|parse|EDN|QueryError/i;
export function toReplicaError(err) {
    if (err instanceof QueryBudget || err instanceof BadRequest || err instanceof Internal)
        return err;
    if (err instanceof QueryBudgetError)
        return new QueryBudget({ message: err.message, code: err.code, clause: err.clause, cells: err.cells, limit: err.limit, spentBy: err.spentBy });
    const message = err instanceof Error ? err.message : String(err);
    return CLIENT_ERROR.test(message) ? new BadRequest({ message }) : new Internal({ message });
}
export const statusOf = (e) => (e._tag === "QueryBudget" ? 413 : e._tag === "BadRequest" ? 400 : 500);
export function replicaErrorResponse(e) {
    const body = { error: e.message, tag: e._tag, message: e.message };
    if (e._tag === "QueryBudget") {
        body.code = e.code;
        body.clause = e.clause;
        body.cells = e.cells;
        body.limit = e.limit;
        body.spentBy = e.spentBy ?? "caller";
    }
    return new Response(JSON.stringify(body), { status: statusOf(e), headers: { "content-type": "application/json" } });
}
//# sourceMappingURL=errors.js.map