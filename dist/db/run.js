/**
 * `db.run` — decode input, run the optimistic prefix, queue the invocation.
 */
import * as Effect from "effect/Effect";
import { makeEid } from "./Eid.js";
import { InvalidRequest } from "./Errors.js";
import { record } from "./http.js";
import { decodeInput, decodeOutput, lowerEntityArg, materializeOutput, } from "./Operation.js";
const newClientOpId = () => typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `c${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const asPrincipal = (p) => ({
    eid: p.eid,
    class: p.class,
    claims: {},
});
const reportOf = (wire, name, schema, view, ack, make) => ({
    t: ack.t,
    txEid: makeEid(ack.txEid),
    datomCount: ack.datomCount,
    output: ack.output,
    dbAfter: make(wire, name, schema, view),
});
export const runOperation = (wire, name, schema, view, bad, operation, entityArg, inputArg, make) => {
    if (bad !== undefined)
        return Effect.fail(bad);
    return Effect.gen(function* () {
        if (operation.on !== undefined && entityArg === undefined) {
            return yield* Effect.fail(new InvalidRequest({
                message: `operation ${operation.name} is contextual and needs an entity`,
            }));
        }
        const input = yield* decodeInput(operation.input, inputArg);
        const entity = operation.on !== undefined ? lowerEntityArg(entityArg) : undefined;
        const clientOpId = newClientOpId();
        const invocation = {
            name: operation.name,
            ...(entity !== undefined ? { entity } : {}),
            input,
            clientOpId,
        };
        const overlay = wire.overlay?.(name);
        if (overlay?.run !== undefined) {
            const who = yield* wire.principal(name);
            const ack = yield* overlay.run({
                invocation,
                operation,
                schema,
                principal: asPrincipal(who),
                db: name,
            });
            const output = yield* decodeOutput(operation.output, ack.output);
            return reportOf(wire, name, schema, view, { ...ack, output }, make);
        }
        const body = yield* wire.operation(name, invocation);
        const ack = record(body);
        const t = typeof ack.t === "number" ? ack.t : 0;
        wire.session(name)?.bump(t);
        const tempids = ack.tempids !== null && typeof ack.tempids === "object"
            ? ack.tempids
            : {};
        const output = yield* decodeOutput(operation.output, materializeOutput(ack.output, tempids));
        return reportOf(wire, name, schema, { ...view, minT: t }, {
            t,
            txEid: typeof ack.txEid === "number" ? ack.txEid : 0,
            datomCount: Array.isArray(ack.datoms)
                ? ack.datoms.length
                : typeof ack.datoms === "number"
                    ? ack.datoms
                    : 0,
            output,
        }, make);
    });
};
//# sourceMappingURL=run.js.map