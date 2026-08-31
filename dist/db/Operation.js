import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { allocationSlots, } from "./allocations.js";
import { normalizeProjectionRevision, } from "./Projection.js";
import { COMPOSED_TRAITS } from "./Composer.js";
import { normalizeDoc } from "./documentation.js";
import { InvalidRequest, OperationsCoverageError } from "./Errors.js";
import { invalidIdentName, isIdentName } from "./IdentName.js";
import { untargetedRef } from "./valueTypes.js";
import {} from "./Tx.js";
export const EntityId = untargetedRef;
/**
 * Symbol-keyed operation metadata. A symbol preserves the long-standing right
 * to declare an ordinary schema field named `operations`.
 */
export const OwnedOperations = Symbol.for("ramose/owned-operations");
const OwnedOperationAuthorToken = Symbol("ramose/owned-operation-author-token");
const emptyOutput = Schema.Struct({});
export const DEFAULT_OPERATION_REVISION = 1;
const normalizeOptimistic = (value) => {
    if (value === undefined)
        return undefined;
    if (typeof value !== "function") {
        throw new Error("ramose/schema: an operation's optimistic projection must be a function");
    }
    return value;
};
export const normalizeOperationRevision = (value) => {
    if (value === undefined)
        return DEFAULT_OPERATION_REVISION;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
        throw new Error(`ramose/schema: operation revision must be a positive integer, not ${JSON.stringify(value)}`);
    }
    return value;
};
const defineNamedOperation = (name, schemas, body) => ({
    _tag: "Operation",
    name,
    input: schemas.input,
    output: (schemas.output ?? emptyOutput),
    on: schemas.on,
    doc: normalizeDoc(schemas.doc),
    body,
});
function defineOperation(nameOrSpec, schemas, body) {
    if (typeof nameOrSpec === "string") {
        if (schemas === undefined || body === undefined) {
            throw new Error("ramose: Operation(name, schemas, body) needs schemas and a body");
        }
        return defineNamedOperation(nameOrSpec, schemas, body);
    }
    const self = nameOrSpec.self !== false;
    return {
        _tag: "UnboundOperation",
        input: nameOrSpec.input,
        output: nameOrSpec.output,
        self,
        writes: Object.freeze([...(nameOrSpec.writes ?? [])]),
        allocations: allocationSlots(nameOrSpec.allocates),
        revision: normalizeOperationRevision(nameOrSpec.revision),
        optimistic: normalizeOptimistic(nameOrSpec.optimistic),
        optimisticRevision: normalizeProjectionRevision(nameOrSpec.optimisticRevision),
        doc: normalizeDoc(nameOrSpec.doc),
        run: nameOrSpec.run,
    };
}
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
const definePatch = (name, entity, keys, options) => {
    const operation = defineNamedOperation(name, {
        on: entity,
        input: structOf(entity, keys),
        output: emptyOutput,
        ...(options?.doc !== undefined && { doc: options.doc }),
        ...(options?.schema !== undefined && { schema: options.schema }),
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
const operationFor = (schema) => Object.assign(((name, schemas, body) => defineOperation(name, { ...schemas, schema }, body)), {
    patch: ((name, entity, keys, options) => definePatch(name, entity, keys, { ...options, schema })),
});
export const bindOwnedOperations = (owner, operations, author) => {
    const out = {};
    if (operations === undefined) {
        return out;
    }
    if (Reflect.ownKeys(operations).some((key) => typeof key !== "string")) {
        throw new Error("ramose/schema: operation map keys must be strings");
    }
    const authorToken = author?.[OwnedOperationAuthorToken];
    for (const [localName, operation] of Object.entries(operations)) {
        if (!isIdentName(localName))
            throw invalidIdentName("operation", localName);
        if (typeof operation !== "object" ||
            operation === null ||
            operation._tag !== "UnboundOperation") {
            throw new Error(`ramose/schema: ${owner.ns}.${localName} must be Ramose.Operation({ input, output, run })`);
        }
        if (!Array.isArray(operation.writes) ||
            operation.writes.some((entity) => entity?._tag !== "Entity")) {
            throw new Error(`ramose/schema: ${owner.ns}.${localName} writes must contain entity definitions`);
        }
        if (authorToken !== undefined &&
            operation[OwnedOperationAuthorToken] !== authorToken) {
            throw new Error(`ramose/schema: ${owner.ns}.${localName} must use the Operation author supplied to its operations callback`);
        }
        out[localName] = {
            _tag: "OwnedOperation",
            owner,
            localName,
            input: operation.input,
            output: operation.output,
            self: operation.self,
            writes: operation.writes,
            allocations: operation.allocations ?? [],
            revision: normalizeOperationRevision(operation.revision),
            optimistic: normalizeOptimistic(operation.optimistic),
            optimisticRevision: normalizeProjectionRevision(operation.optimisticRevision),
            doc: operation.doc,
            run: operation.run,
        };
    }
    return out;
};
export const isOwnedOperation = (value) => typeof value === "object" &&
    value !== null &&
    value._tag === "OwnedOperation";
export const ownedOperationAuthor = () => {
    const token = {};
    const author = ((spec) => {
        const operation = defineOperation(spec);
        Object.defineProperty(operation, OwnedOperationAuthorToken, { value: token });
        return operation;
    });
    Object.defineProperty(author, OwnedOperationAuthorToken, { value: token });
    return author;
};
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
        ...(schema !== undefined && { schema }),
        get,
        names: () => namesOfRegistry(operations),
        cards: () => cardsOfRegistry(operations, get),
    };
};
/** An inert registry of operation declarations. */
export const Operations = (operations) => makeRegistry(operations);
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
 * A runtime registry must cover every required id. Extra registered ops are
 * fine. Missing ids throw
 * {@link OperationsCoverageError}.
 */
export const checkOperationsCoverage = (required, registered) => {
    const need = namesOf(required);
    const have = new Set(namesOf(registered));
    const missing = need.filter((n) => !have.has(n));
    if (missing.length === 0)
        return;
    throw new OperationsCoverageError({
        message: `ramose: runtime is missing operations: ${missing.join(", ")} — renaming an op is a wire-contract change`,
        missing,
    });
};
export { OperationsCoverageError };
export { asLookupRef, lowerEntityArg } from "./entityArg.js";
export const decodeInput = (schema, input) => Schema.decodeUnknownEffect(schema)(input).pipe(Effect.mapError((e) => new InvalidRequest({
    message: e.message || "invalid operation input",
})));
export const encodeOutput = (schema, output) => Schema.encodeUnknownEffect(schema)(output).pipe(Effect.mapError((e) => new InvalidRequest({
    message: e.message || "invalid operation output",
})));
export const decodeOutput = (schema, output) => Schema.decodeUnknownEffect(schema)(output).pipe(Effect.mapError((e) => new InvalidRequest({
    message: e.message || "invalid operation output",
})));
//# sourceMappingURL=Operation.js.map