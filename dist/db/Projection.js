import { bytesToBase64 } from "../internal/core/log.js";
import { isClientRef, isMutationRef } from "./refs.js";
const fail = (detail) => {
    throw new Error(`ramose/projection: ${detail}`);
};
export const DEFAULT_PROJECTION_REVISION = 1;
export const normalizeProjectionRevision = (value) => {
    if (value === undefined)
        return DEFAULT_PROJECTION_REVISION;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
        fail(`a projection revision must be a positive integer, not ${JSON.stringify(value)}`);
    }
    return value;
};
const requireTarget = (entity) => {
    if (!isMutationRef(entity)) {
        fail("a projection target must be an EntityId or a ClientRef");
    }
    return entity;
};
const finiteDouble = (value) => {
    if (Number.isNaN(value))
        fail("a double value must not be NaN");
    return {
        type: "double",
        value: value === Number.POSITIVE_INFINITY
            ? "positive-infinity"
            : value === Number.NEGATIVE_INFINITY
                ? "negative-infinity"
                : value + 0,
    };
};
const integral = (type, ident, value) => {
    const millis = type === "instant" && value instanceof Date
        ? value.getTime()
        : value;
    if (typeof millis !== "number" || !Number.isSafeInteger(millis)) {
        fail(`${ident} expects a safe integer ${type}`);
    }
    return { type, value: millis };
};
const lowerValue = (field, value) => {
    const ident = field.ident;
    switch (field.valueType) {
        case undefined:
            return fail(`${ident} has no declared value type — brand its schema with stored(schema, valueType)`);
        case "ref":
            if (!isMutationRef(value)) {
                fail(`${ident} expects an EntityId or a ClientRef`);
            }
            return { type: "ref", value: value };
        case "string":
            if (typeof value !== "string")
                fail(`${ident} expects a string`);
            return { type: "string", value: value };
        case "uuid":
            if (typeof value !== "string")
                fail(`${ident} expects a uuid string`);
            return { type: "uuid", value: value };
        case "boolean":
            if (typeof value !== "boolean")
                fail(`${ident} expects a boolean`);
            return { type: "boolean", value: value };
        case "long":
            return integral("long", ident, value);
        case "instant":
            return integral("instant", ident, value);
        case "double":
            if (typeof value !== "number")
                fail(`${ident} expects a number`);
            return finiteDouble(value);
        case "bytes":
            if (!(value instanceof Uint8Array))
                fail(`${ident} expects a Uint8Array`);
            return { type: "bytes", value: bytesToBase64(value) };
    }
};
const RESERVED_NAMESPACES = [":db/", ":db.", ":ramose/"];
const requireField = (field) => {
    if (typeof field !== "object" || field === null ||
        typeof field.ident !== "string" || !field.ident.startsWith(":")) {
        fail("a projection field must be a stamped field ref (Issue.status)");
    }
    if (RESERVED_NAMESPACES.some((prefix) => field.ident.startsWith(prefix))) {
        fail(`${field.ident} is engine metadata and is not a projectable field`);
    }
    return field.ident;
};
class Builder {
    allocations;
    ops = [];
    sealed = false;
    constructor(allocations) {
        this.allocations = allocations;
    }
    seal() {
        this.sealed = true;
    }
    open() {
        if (this.sealed) {
            fail("the transaction builder is only usable while the projection runs");
        }
    }
    set(entity, field, value) {
        this.open();
        const ident = requireField(field);
        this.ops.push({
            op: "set",
            entity: requireTarget(entity),
            field: ident,
            value: lowerValue(field, value),
        });
        return this;
    }
    remove(entity, field, value) {
        this.open();
        const ident = requireField(field);
        this.ops.push({
            op: "remove",
            entity: requireTarget(entity),
            field: ident,
            value: value === undefined ? null : lowerValue(field, value),
        });
        return this;
    }
    create(slot, definition) {
        this.open();
        const ref = Object.hasOwn(this.allocations, slot)
            ? this.allocations[slot]
            : undefined;
        if (!isClientRef(ref)) {
            fail(`${JSON.stringify(slot)} is not a declared allocation slot of this invocation`);
        }
        if (typeof definition !== "object" || definition === null ||
            typeof definition.ns !== "string" || definition.ns.length === 0) {
            fail(`create(${JSON.stringify(slot)}) needs an entity definition`);
        }
        this.ops.push({
            op: "create",
            entity: ref,
            slot,
            type: definition.ns,
        });
        return ref;
    }
    delete(entity) {
        this.open();
        this.ops.push({ op: "delete", entity: requireTarget(entity) });
        return this;
    }
}
export const runProjection = (projection, invocation) => {
    const builder = new Builder(invocation.allocations ?? {});
    try {
        const returned = projection({
            input: invocation.input,
            self: invocation.self,
            tx: builder,
        });
        if (typeof returned?.then ===
            "function") {
            void returned.catch(() => { });
            return Object.freeze({
                type: "failed",
                reason: "ramose/projection: a projection must be synchronous",
            });
        }
    }
    catch (cause) {
        return Object.freeze({
            type: "failed",
            reason: cause instanceof Error ? cause.message : String(cause),
        });
    }
    finally {
        builder.seal();
    }
    return Object.freeze({
        type: "changeset",
        changeset: Object.freeze(builder.ops.map((op) => Object.freeze(op))),
    });
};
//# sourceMappingURL=Projection.js.map