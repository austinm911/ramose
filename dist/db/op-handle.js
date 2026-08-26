/**
 * Build an `Op` handle: transaction verbs via {@link txBuilder}, plus the
 * injected reads / effect / principal. Shared by the client overlay and
 * the peer Worker so both sides run the same body.
 */
import * as Effect from "effect/Effect";
import { InternalError, InvalidRequest, isDatabaseError } from "./Errors.js";
import { PrefixHalt, } from "./Operation.js";
import { asPromise, runSync } from "./promise.js";
import { lowerEntityArg, tempid } from "./entityArg.js";
import { txBuilder, txOps } from "./Tx.js";
const wrapSelf = (tx, self) => {
    // Worker catalogs are empty; `tx.entity` is catalog-typed. The runtime
    // already accepts eid / tempid / lookup / handle via `resolveEntity`.
    const bind = tx.entity;
    return runSync(bind(self));
};
/** Narrow a pull subject to an engine entity ref without a channel cast. */
export const entityRefOf = (subject) => {
    const lowered = lowerEntityArg(subject);
    if (typeof lowered === "number" || typeof lowered === "string")
        return lowered;
    if (Array.isArray(lowered) &&
        lowered.length === 2 &&
        typeof lowered[0] === "string") {
        return [lowered[0], lowered[1]];
    }
    throw new InvalidRequest({ message: "bad pull subject" });
};
const missingInstall = () => Effect.fail(new InternalError({
    message: "ramose: no databases.install on this runtime",
}));
const asEffectCause = (cause) => {
    if (isDatabaseError(cause))
        return cause;
    if (cause !== null &&
        typeof cause === "object" &&
        "_tag" in cause &&
        typeof cause._tag === "string") {
        return cause;
    }
    return new InternalError({
        message: cause instanceof Error ? cause.message : String(cause),
    });
};
export const buildOp = (options) => {
    const tx = txBuilder(options.schema);
    const self = options.self === undefined ? undefined : wrapSelf(tx, options.self);
    const prefix = { halted: false };
    let frozen;
    const haltPrefix = () => {
        if (prefix.halted)
            return;
        prefix.halted = true;
        frozen = [...txOps(tx)];
    };
    const effect = (_name, run) => {
        if (options.effects === "halt") {
            haltPrefix();
            return Effect.die(new PrefixHalt());
        }
        const ctx = {
            env: options.effectCtx?.env,
            principal: options.principal,
            databases: options.effectCtx?.databases ?? {
                install: () => missingInstall(),
            },
        };
        const out = run(ctx);
        if (Effect.isEffect(out))
            return out;
        return Effect.tryPromise({
            try: () => out,
            catch: (cause) => asEffectCause(cause),
        });
    };
    const op = {
        self,
        principal: options.principal,
        db: options.db,
        _effects: options.effects,
        _prefix: prefix,
        _haltPrefix: haltPrefix,
        query: options.q,
        pull: options.pull,
        effect,
        entity: tx.entity,
        set: tx.set,
        remove: tx.remove,
        delete: tx.delete,
        put: tx.put,
        update: tx.update,
    };
    return {
        op,
        ops: () => frozen ?? txOps(tx),
    };
};
const promiseEntity = (entity) => ({
    _tag: "TxHandle",
    eid: entity.eid,
    set: (field, value) => {
        runSync(entity.set(field, value));
    },
    remove: (field, value) => {
        runSync(entity.remove(field, value));
    },
    delete: () => {
        runSync(entity.delete());
    },
});
/** Wrap the Effect runtime handle as the async `Op` a body sees. */
export const asPromiseOp = (op) => {
    const entity = ((id) => promiseEntity(runSync(id === undefined ? op.entity() : op.entity(id))));
    return {
        self: (op.self === undefined
            ? undefined
            : promiseEntity(op.self)),
        principal: op.principal,
        db: op.db,
        entity,
        tempid,
        set: (e, field, value) => {
            runSync(op.set(e, field, value));
        },
        remove: (e, field, value) => {
            runSync(op.remove(e, field, value));
        },
        delete: (e) => {
            runSync(op.delete(e));
        },
        put: ((entity, a, b) => promiseEntity(runSync(b === undefined ? op.put(entity, a) : op.put(entity, a, b)))),
        update: ((entity, a, b) => promiseEntity(runSync(b === undefined ? op.update(entity, a) : op.update(entity, a, b)))),
        query: ((input) => asPromise(op.query(input))),
        pull: (subject, pattern) => asPromise(op.pull(subject, pattern)),
        effect: (name, run) => {
            if (op._effects === "halt") {
                op._haltPrefix();
                throw new PrefixHalt();
            }
            return asPromise(op.effect(name, (ctx) => Promise.resolve(run({
                env: ctx.env,
                principal: ctx.principal,
                databases: {
                    install: (catalog, dbName) => asPromise(ctx.databases.install(catalog, dbName)),
                },
            }))));
        },
    };
};
/** Run a body, treating a {@link PrefixHalt} as a successful prefix stop. */
export const runBody = (operation, op, input) => Effect.tryPromise({
    try: () => Promise.resolve(operation.body(asPromiseOp(op), input)),
    catch: (cause) => cause,
}).pipe(Effect.map((output) => op._prefix.halted
    ? { output: undefined, halted: true }
    : { output, halted: false }), Effect.catch((cause) => op._prefix.halted || cause instanceof PrefixHalt
    ? Effect.succeed({ output: undefined, halted: true })
    : Effect.fail(cause)), Effect.catchDefect((defect) => op._prefix.halted || defect instanceof PrefixHalt
    ? Effect.succeed({ output: undefined, halted: true })
    : Effect.die(defect)));
//# sourceMappingURL=op-handle.js.map