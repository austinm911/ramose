import { isAllocationSlotName, readAllocationPath, } from "../../db/allocations.js";
import { isClientRef } from "../../db/refs.js";
import { openEntityId, sealEntityId, SEALED_ENTITY_ID_MIN_LENGTH, } from "../replication/entity-id.js";
export const parseInvocationAllocations = (value) => {
    if (value === undefined)
        return [];
    if (!Array.isArray(value))
        return undefined;
    const slots = new Set();
    const refs = new Set();
    const parsed = [];
    for (const entry of value) {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
            return undefined;
        }
        const record = entry;
        if (Object.keys(record).length !== 2 ||
            !isAllocationSlotName(record.slot) || !isClientRef(record.clientRef))
            return undefined;
        if (slots.has(record.slot) || refs.has(record.clientRef))
            return undefined;
        slots.add(record.slot);
        refs.add(record.clientRef);
        parsed.push(Object.freeze({ slot: record.slot, clientRef: record.clientRef }));
    }
    return Object.freeze(parsed.sort((left, right) => left.slot < right.slot ? -1 : left.slot > right.slot ? 1 : 0));
};
const EPOCH_UPDATE_REQUIRED = Object.freeze({ _tag: "UpdateRequired" });
export const decideEpoch = (bound, sealing) => bound.keyId === sealing.keyId
    ? Object.freeze({ _tag: "Agreed", sealing, scope: bound.scope })
    : EPOCH_UPDATE_REQUIRED;
export const sameEpochScope = (left, right) => left.keyId === right.keyId &&
    left.scope.server === right.scope.server &&
    left.scope.principal === right.scope.principal &&
    left.scope.database === right.scope.database;
export const parseEntityIdScope = (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return undefined;
    }
    const record = value;
    if (typeof record.server !== "string" || record.server.length === 0 ||
        typeof record.principal !== "string" || record.principal.length === 0 ||
        typeof record.database !== "string" || record.database.length === 0)
        return undefined;
    return Object.freeze({
        server: record.server,
        principal: record.principal,
        database: record.database,
    });
};
const MAX_SEALED_TARGET_LENGTH = 4096;
const DENIED = Object.freeze({ _tag: "Denied" });
const UPDATE_REQUIRED = Object.freeze({ _tag: "UpdateRequired" });
export const resolveSealedTarget = async (sealing, scope, token) => {
    if (token.length === 0 || token.length > MAX_SEALED_TARGET_LENGTH)
        return DENIED;
    const resolution = await openEntityId(sealing, scope, token);
    switch (resolution.type) {
        case "resolved":
            return Object.freeze({ _tag: "Resolved", eid: resolution.eid });
        case "update-required":
            return UPDATE_REQUIRED;
        case "denied":
            return DENIED;
    }
};
export const isEntityRefPath = (shape, path) => {
    let cursor = shape;
    for (const segment of path) {
        if (cursor._tag === "array") {
            if (typeof segment !== "number")
                return false;
            cursor = cursor.items;
            continue;
        }
        if (cursor._tag === "struct") {
            if (typeof segment !== "string")
                return false;
            const field = cursor.fields.find((candidate) => candidate.key === segment);
            if (field === undefined)
                return false;
            cursor = field.shape;
            continue;
        }
        return false;
    }
    return cursor._tag === "ref";
};
export const allocatedEids = (tempids) => new Set(Object.values(tempids));
export const extractAllocations = (declared, outputShape, output, requested, allocated) => {
    const slots = [];
    for (const allocation of requested) {
        const declaration = declared.find((candidate) => candidate.slot === allocation.slot);
        if (declaration === undefined ||
            !isEntityRefPath(outputShape, declaration.path)) {
            return Object.freeze({ _tag: "Unallocated", slot: allocation.slot });
        }
        const value = readAllocationPath(output, declaration.path);
        if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
            return Object.freeze({ _tag: "Unallocated", slot: allocation.slot });
        }
        if (!allocated.has(value)) {
            return Object.freeze({ _tag: "Unallocated", slot: allocation.slot });
        }
        slots.push(Object.freeze({ slot: allocation.slot, eid: value }));
    }
    return Object.freeze({ _tag: "Allocated", slots: Object.freeze(slots) });
};
export const outputEntityRefPaths = (shape, output) => {
    const paths = [];
    const walk = (current, value, path) => {
        switch (current._tag) {
            case "ref":
                if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
                    paths.push(Object.freeze([...path]));
                }
                return;
            case "array":
                if (Array.isArray(value)) {
                    for (let index = 0; index < value.length; index++) {
                        walk(current.items, value[index], [...path, index]);
                    }
                }
                return;
            case "struct":
                if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                    for (const field of current.fields) {
                        if (!Object.hasOwn(value, field.key))
                            continue;
                        walk(field.shape, value[field.key], [...path, field.key]);
                    }
                }
                return;
            case "scalar":
            case "opaque":
                return;
        }
    };
    walk(shape, output, []);
    return Object.freeze(paths);
};
const replaceAt = (value, path, replacement) => {
    const [head, ...rest] = path;
    if (head === undefined)
        return replacement;
    if (typeof head === "number") {
        if (!Array.isArray(value) || head >= value.length) {
            throw new Error("entity-reference position is not an array index");
        }
        const copy = [...value];
        copy[head] = replaceAt(value[head], rest, replacement);
        return copy;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error("entity-reference position is not an object property");
    }
    const record = value;
    if (!Object.hasOwn(record, head)) {
        throw new Error("entity-reference position is absent");
    }
    return { ...record, [head]: replaceAt(record[head], rest, replacement) };
};
export const sealOutputEntityRefs = async (sealing, scope, output, paths) => {
    const sealed = await Promise.all(paths.map(async (path) => {
        const eid = readAllocationPath(output, path);
        if (typeof eid !== "number" || !Number.isSafeInteger(eid) || eid < 0) {
            throw new Error("output entity-reference position holds no resolved eid");
        }
        return { path, handle: await sealEntityId(sealing, scope, eid) };
    }));
    let projected = output;
    for (const { path, handle } of sealed) {
        projected = replaceAt(projected, path, handle);
    }
    return projected;
};
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const mayBeSealedEntityId = (value) => value.length >= SEALED_ENTITY_ID_MIN_LENGTH &&
    value.length <= MAX_SEALED_TARGET_LENGTH &&
    value.length % 4 !== 1 &&
    BASE64URL.test(value);
export const mayCarrySealedEntityId = (input) => {
    const seen = new Set();
    const pending = [input];
    while (pending.length > 0) {
        const value = pending.pop();
        if (typeof value === "string") {
            if (mayBeSealedEntityId(value))
                return true;
            continue;
        }
        if (typeof value !== "object" || value === null)
            continue;
        if (seen.has(value))
            continue;
        seen.add(value);
        for (const child of Array.isArray(value) ? value : Object.values(value)) {
            pending.push(child);
        }
    }
    return false;
};
export const inputEntityRefHandles = (shape, input) => {
    const paths = [];
    const walk = (current, value, path) => {
        switch (current._tag) {
            case "ref":
                if (typeof value === "string")
                    paths.push(Object.freeze([...path]));
                return;
            case "array":
                if (Array.isArray(value)) {
                    for (let index = 0; index < value.length; index++) {
                        walk(current.items, value[index], [...path, index]);
                    }
                }
                return;
            case "struct":
                if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                    for (const field of current.fields) {
                        if (!Object.hasOwn(value, field.key))
                            continue;
                        walk(field.shape, value[field.key], [...path, field.key]);
                    }
                }
                return;
            case "scalar":
            case "opaque":
                return;
        }
    };
    walk(shape, input, []);
    return Object.freeze(paths);
};
const DENIED_INPUT = Object.freeze({ _tag: "Denied" });
const UPDATE_REQUIRED_INPUT = Object.freeze({ _tag: "UpdateRequired" });
export const resolveSealedInputRefs = async (sealing, scope, input, paths) => {
    const opened = await Promise.all(paths.map(async (path) => {
        const token = readAllocationPath(input, path);
        if (typeof token !== "string") {
            throw new Error("input entity-reference position holds no handle");
        }
        return { path, resolution: await resolveSealedTarget(sealing, scope, token) };
    }));
    if (opened.some(({ resolution }) => resolution._tag === "UpdateRequired")) {
        return UPDATE_REQUIRED_INPUT;
    }
    if (opened.some(({ resolution }) => resolution._tag === "Denied")) {
        return DENIED_INPUT;
    }
    let resolved = input;
    for (const { path, resolution } of opened) {
        if (resolution._tag !== "Resolved")
            continue;
        resolved = replaceAt(resolved, path, resolution.eid);
    }
    return Object.freeze({ _tag: "Resolved", input: resolved });
};
export const sealAllocationMappings = async (sealing, scope, slots, requested) => {
    const bound = new Map(requested.map((entry) => [entry.slot, entry.clientRef]));
    return Object.freeze(await Promise.all(slots.map(async (allocated) => {
        const clientRef = bound.get(allocated.slot);
        if (clientRef === undefined) {
            throw new Error("allocated slot has no bound client ref");
        }
        return Object.freeze({
            slot: allocated.slot,
            clientRef,
            entityId: await sealEntityId(sealing, scope, allocated.eid),
        });
    })));
};
//# sourceMappingURL=entity-targets.js.map