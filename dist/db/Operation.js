/**
 * Explicitly defined, schema-checked operations — the typed write path.
 *
 * An operation is a named value: input/output are `effect/Schema`, the body
 * is an async function. Transaction verbs accumulate one commit; `op.effect`
 * is a server-side side-effect step. The client runs the same body and
 * stops at the first `op.effect` (the optimistic prefix).
 *
 * Portable: this module is on `ramose/db` and must not import the Worker
 * or the engine barrel.
 */
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { InvalidRequest, OperationsCoverageError } from "./Errors.js";
import { asLookupRef, lowerEntityArg, tempid } from "./entityArg.js";
import { isTxHandle, } from "./Tx.js";
/**
 * Schema for an entity id in operation input / output.
 *
 * The decoded type is `number`. A body may return a handle (or
 * `{ id: handle }`) in an `EntityId` slot — {@link finalizeOutput}
 * rematerializes it after the writer assigns eids.
 */
export const EntityId = Schema.Number;
/**
 * Client-side `op.effect` ends the optimistic prefix. Not a {@link DbError};
 * `db.run` keeps the ops collected so far. Thrown into an async body — rethrow
 * it from a `catch` if you intercept it; swallowing does not un-halt the prefix.
 */
export class PrefixHalt extends Data.TaggedError("ramose/PrefixHalt") {
}
const emptyOutput = Schema.Struct({});
const docOf = (doc) => doc === undefined || doc === "" ? undefined : doc;
/** Define one named operation. */
const defineOperation = (name, schemas, body) => ({
    _tag: "Operation",
    name,
    input: schemas.input,
    output: (schemas.output ?? emptyOutput),
    on: schemas.on,
    doc: docOf(schemas.doc),
    body,
});
const structOf = (entity, keys) => {
    const fields = {};
    for (const key of keys) {
        const field = entity.fields[key];
        if (field === undefined) {
            throw new Error(`ramose: ${entity.ns} has no field "${key}"`);
        }
        fields[key] = field.schema;
    }
    return Schema.Struct(fields);
};
/**
 * A single-field (or few-field) contextual update. The low-ceremony
 * path for what used to be a three-line `transact` (`setTitle`).
 *
 * `Operation.patch("issue/set-title", Issue, ["title"])` then
 * `db.run(op, issueId, { title })`.
 */
const definePatch = (name, entity, keys, options) => {
    const operation = defineOperation(name, {
        on: entity,
        input: structOf(entity, keys),
        output: emptyOutput,
        doc: options?.doc,
        schema: options?.schema,
    }, (op, input) => {
        const self = op.self;
        if (self === undefined) {
            throw new Error(`ramose: ${name} is contextual and needs an entity`);
        }
        op.update(entity, self, input);
        return {};
    });
    return operation;
};
/**
 * Bind `schema:` once for a catalog so every op from the helper carries
 * the membership / ident checks. `Operation.for(Reef)("issue/move", …)`.
 */
const operationFor = (schema) => Object.assign(((name, schemas, body) => defineOperation(name, { ...schemas, schema }, body)), {
    patch: ((name, entity, keys, options) => definePatch(name, entity, keys, { ...options, schema })),
});
/** Define one named operation. `Operation.for(catalog)` bakes `schema:` in. */
export const Operation = Object.assign(defineOperation, { for: operationFor, patch: definePatch });
const namesOfRegistry = (operations) => {
    const names = new Set();
    for (const op of Object.values(operations)) {
        if (typeof op.name === "string" && op.name.length > 0)
            names.add(op.name);
    }
    return [...names].sort();
};
const cardsOfRegistry = (operations, get) => namesOfRegistry(operations).flatMap((name) => {
    const op = get(name);
    if (op === undefined)
        return [];
    const ns = op.on?.ns;
    return [
        {
            name,
            ...(op.doc !== undefined ? { doc: op.doc } : {}),
            ...(typeof ns === "string" && ns.length > 0 ? { on: ns } : {}),
        },
    ];
});
const makeRegistry = (operations, schema) => {
    const get = (name) => {
        for (const op of Object.values(operations)) {
            if (op.name === name)
                return op;
        }
        return undefined;
    };
    return {
        _tag: "Operations",
        operations,
        schema,
        get,
        names: () => namesOfRegistry(operations),
        cards: () => cardsOfRegistry(operations, get),
    };
};
/** A deploy-time / client registry of operations. */
export const Operations = (operations) => makeRegistry(operations);
/**
 * Catalog-bound registry both the app and the peer entry import — one
 * source of truth for op ids, inputs, and outputs.
 *
 * ```ts
 * const Op = Operation.for(Reef);
 * export const setTitleOp = Op.patch("issue/set-title", Issue, ["title"]);
 * export const operations = defineOperations(Reef, { setTitleOp });
 * // peer: createServer({ operations })
 * // Server: Server("Ramose", { operations, main: import.meta.resolve("./peer.ts") })
 * ```
 *
 * Wire ids are each operation's declared `name`. Renaming an id is a
 * wire-contract change — add a new id rather than reuse one with a
 * different input or output.
 */
export const defineOperations = (schema, operations) => makeRegistry(operations, schema);
/** Sorted unique wire ids in a registry. */
export const operationNames = (ops) => ops === undefined ? [] : [...ops.names()];
/** Discovery cards (name / doc / on) for a registry. */
export const operationCards = (ops) => (ops === undefined ? [] : ops.cards());
const namesOf = (source) => {
    if (typeof source === "object" &&
        source !== null &&
        "_tag" in source &&
        source._tag === "Operations") {
        return operationNames(source);
    }
    return [...new Set(source.filter((n) => typeof n === "string" && n.length > 0))].sort();
};
/**
 * The peer must register every id the client ships. Extra peer ops are
 * fine (a newer Worker, an older bundle). Missing ids throw
 * {@link OperationsCoverageError}.
 */
export const checkOperationsCoverage = (required, registered) => {
    const need = namesOf(required);
    const have = new Set(namesOf(registered));
    const missing = need.filter((n) => !have.has(n));
    if (missing.length === 0)
        return;
    throw new OperationsCoverageError({
        message: `ramose: peer is missing operations: ${missing.join(", ")} — the client ships these ids; renaming an op is a wire-contract change`,
        missing,
    });
};
export { OperationsCoverageError };
export { asLookupRef, lowerEntityArg } from "./entityArg.js";
/**
 * Replace entity handles and tempid strings with resolved eids so an
 * operation's return value can be schema-encoded.
 */
export const materializeOutput = (value, tempids) => {
    if (isTxHandle(value)) {
        const ref = value.eid;
        if (typeof ref === "string")
            return tempids[ref] ?? ref;
        return ref;
    }
    if (typeof value === "string" && tempids[value] !== undefined) {
        return tempids[value];
    }
    if (Array.isArray(value)) {
        return value.map((item) => materializeOutput(item, tempids));
    }
    if (value !== null && typeof value === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = materializeOutput(v, tempids);
        }
        return out;
    }
    return value;
};
/** Decode operation input; schema failures are `InvalidRequest`. */
export const decodeInput = (schema, input) => Schema.decodeUnknownEffect(schema)(input).pipe(Effect.mapError((e) => new InvalidRequest({
    message: e.message || "invalid operation input",
})));
/** Encode operation output for the wire. */
export const encodeOutput = (schema, output) => Schema.encodeUnknownEffect(schema)(output).pipe(Effect.mapError((e) => new InvalidRequest({
    message: e.message || "invalid operation output",
})));
/**
 * Resolve handles / named tempids against a commit's tempid map, then
 * encode. Call after the writer assigns eids — that is how `db.run`
 * returns the id of what you created.
 */
export const finalizeOutput = (schema, value, tempids) => encodeOutput(schema, materializeOutput(value, tempids)).pipe(Effect.catch(() => Effect.succeed(materializeOutput(value, tempids))));
/** Decode a wire output back into the operation's output type. */
export const decodeOutput = (schema, output) => Schema.decodeUnknownEffect(schema)(output).pipe(Effect.mapError((e) => new InvalidRequest({
    message: e.message || "invalid operation output",
})));
//# sourceMappingURL=Operation.js.map