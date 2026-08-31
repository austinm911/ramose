import * as Effect from "effect/Effect";
import { markEngineTypeAssertion } from "../internal/core/tx-provenance.js";
import { lowerAttr } from "./attrRef.js";
import { composerIdent } from "./compose.js";
import { asLookupRef, lowerEntityArg, lowerWriteValue, tempid } from "./entityArg.js";
import { TxRejected } from "./Errors.js";
export const TX_INTERNALS = Symbol.for("ramose.tx.internals");
const internalsOf = (tx) => {
    const inner = tx[TX_INTERNALS];
    if (inner === undefined) {
        throw new Error("ramose: tx internals are not available");
    }
    return inner;
};
export const txOps = (tx) => internalsOf(tx).ops();
export const txSchema = (tx) => internalsOf(tx).schema;
export const isTxHandle = (e) => typeof e === "object" &&
    e !== null &&
    e._tag === "TxHandle";
const fieldMeta = (entity, key) => {
    if (typeof entity !== "object" || entity === null || !("fields" in entity)) {
        return undefined;
    }
    const fields = entity.fields;
    return fields?.[key];
};
const isCardManyScalarField = (entity, key) => {
    const field = fieldMeta(entity, key);
    return field?.cardinality === "many" && field?.valueType !== "ref";
};
const isCardManyWrite = (entity, key, value) => {
    const field = fieldMeta(entity, key);
    if (field?.cardinality !== "many" || !Array.isArray(value))
        return false;
    return field.valueType !== "ref" || asLookupRef(value) === undefined;
};
const resolveEntity = (e) => lowerEntityArg(e);
const fieldIdent = (entity, key) => {
    if (typeof entity === "object" && entity !== null && "fields" in entity) {
        const fields = entity
            .fields;
        const ident = fields?.[key]?.ident;
        if (typeof ident === "string")
            return ident;
    }
    const ns = typeof entity === "object" &&
        entity !== null &&
        "ns" in entity &&
        typeof entity.ns === "string"
        ? entity.ns
        : "";
    return ns.length > 0 ? `:${ns}/${key}` : key;
};
const lowerPut = (entity, eid, attrs) => {
    const map = { ":db/id": eid };
    const ns = typeof entity === "object" &&
        entity !== null &&
        "ns" in entity &&
        typeof entity.ns === "string"
        ? entity.ns
        : "";
    if (ns.length > 0) {
        map[":ramose/type"] = composerIdent(ns);
        markEngineTypeAssertion(map);
    }
    const extras = [];
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined)
            continue;
        const ident = fieldIdent(entity, key);
        if (isCardManyScalarField(entity, key) && Array.isArray(value)) {
            for (const item of value) {
                const lowered = lowerWriteValue(item);
                if (lowered === undefined)
                    continue;
                extras.push([":db/add", eid, ident, lowered]);
            }
            continue;
        }
        const lowered = lowerWriteValue(value);
        if (lowered === undefined)
            continue;
        map[ident] = lowered;
    }
    return { map, extras };
};
const upsertIdents = (entity, attrs) => {
    if (typeof entity !== "object" || entity === null || !("fields" in entity)) {
        return [];
    }
    const fields = entity.fields;
    if (fields === undefined)
        return [];
    const out = [];
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined)
            continue;
        const field = fields[key];
        if (field?.unique !== "upsert")
            continue;
        const ident = typeof field.ident === "string" ? field.ident : fieldIdent(entity, key);
        const lowered = lowerWriteValue(value);
        if (lowered === undefined)
            continue;
        out.push([ident, lowered]);
    }
    return out;
};
const lowerUpdate = (entity, eid, attrs) => {
    const ops = [];
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined)
            continue;
        const ident = fieldIdent(entity, key);
        if (isCardManyWrite(entity, key, value)) {
            for (const item of value) {
                const lowered = lowerWriteValue(item);
                if (lowered === undefined)
                    continue;
                ops.push([":db/update", eid, ident, lowered]);
            }
            continue;
        }
        const lowered = lowerWriteValue(value);
        if (lowered === undefined)
            continue;
        ops.push([":db/update", eid, ident, lowered]);
    }
    return ops;
};
const makeHandle = (eid, ops) => ({
    _tag: "TxHandle",
    eid,
    set: (field, value) => Effect.sync(() => {
        ops.push([":db/add", eid, lowerAttr(field), lowerWriteValue(value)]);
    }),
    remove: (field, value) => Effect.sync(() => {
        if (value === undefined) {
            ops.push([":db/retract", eid, lowerAttr(field)]);
        }
        else {
            ops.push([":db/retract", eid, lowerAttr(field), lowerWriteValue(value)]);
        }
    }),
    delete: Effect.sync(() => {
        ops.push([":db/retractEntity", eid]);
    }),
});
export const txBuilder = (schema) => {
    const ops = [];
    let next = 0;
    const builder = {
        entity: ((id) => Effect.sync(() => {
            const resolved = id === undefined
                ? `tmp-${++next}`
                : resolveEntity(id);
            return makeHandle(resolved, ops);
        })),
        tempid,
        set: (e, field, value) => Effect.sync(() => {
            ops.push([
                ":db/add",
                resolveEntity(e),
                lowerAttr(field),
                lowerWriteValue(value),
            ]);
        }),
        remove: (e, field, value) => Effect.sync(() => {
            if (value === undefined) {
                ops.push([":db/retract", resolveEntity(e), lowerAttr(field)]);
            }
            else {
                ops.push([
                    ":db/retract",
                    resolveEntity(e),
                    lowerAttr(field),
                    lowerWriteValue(value),
                ]);
            }
        }),
        delete: (e) => Effect.sync(() => {
            ops.push([":db/retractEntity", resolveEntity(e)]);
        }),
        put: ((entity, a, b) => Effect.sync(() => {
            const attrs = (b !== undefined ? b : a);
            const id = b !== undefined ? a : undefined;
            const eid = id === undefined
                ? `tmp-${++next}`
                : resolveEntity(id);
            const { map, extras } = lowerPut(entity, eid, attrs ?? {});
            ops.push(map);
            ops.push(...extras);
            return makeHandle(eid, ops);
        })),
        update: ((entity, a, b) => Effect.sync(() => {
            const attrs = ((b !== undefined ? b : a) ?? {});
            const id = b !== undefined ? a : undefined;
            let eid;
            if (id !== undefined) {
                eid = resolveEntity(id);
            }
            else {
                const lookups = upsertIdents(entity, attrs);
                if (lookups.length === 0) {
                    throw new TxRejected({
                        message: 'update map form needs a unique: "upsert" field',
                        code: "tx/invalid",
                    });
                }
                eid = lookups[0];
            }
            const written = lowerUpdate(entity, eid, attrs);
            if (id === undefined) {
                const lookups = upsertIdents(entity, attrs);
                const ping = lookups[0];
                const rest = written.filter((op) => !(ping !== undefined &&
                    op[2] === ping[0] &&
                    Object.is(op[3], ping[1])));
                if (rest.length === 0 && ping !== undefined) {
                    ops.push([":db/update", eid, ping[0], ping[1]]);
                }
                else {
                    ops.push(...rest);
                }
            }
            else if (written.length === 0) {
                const ping = upsertIdents(entity, attrs)[0] ?? asLookupRef(eid);
                if (ping !== undefined) {
                    ops.push([":db/update", eid, ping[0], ping[1]]);
                }
                else {
                    ops.push([":db/update", eid]);
                }
            }
            else {
                ops.push(...written);
            }
            return makeHandle(eid, ops);
        })),
    };
    builder[TX_INTERNALS] =
        {
            schema,
            ops: () => ops.slice(),
        };
    return builder;
};
//# sourceMappingURL=Tx.js.map