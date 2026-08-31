import { Index, ValueTag, compareValue, } from "../core/datom.js";
import { bytesToBase64 } from "../core/log.js";
import { canonicalizeJson } from "../authorization/canonical-json.js";
import { sealEntityId } from "./entity-id.js";
import { makeEntityIdentity, opaqueDigest } from "./identity.js";
import { MAX_REPLICATION_CHANGE_BYTES, MAX_REPLICATION_DATOMS_PER_CHANGE, MAX_REPLICATION_DATOMS_PER_SNAPSHOT_CHUNK, MAX_REPLICATION_RAW_VALUE_PART_BYTES, MAX_REPLICATION_STRING_BYTES, } from "./protocol.js";
const utf8 = new TextEncoder();
const HASH_BLOCK_BYTES = 65_536;
const MAX_ENTITY_CACHE = 1_024;
const MAX_STRING_PART_CODE_UNITS = Math.floor(MAX_REPLICATION_STRING_BYTES / 3);
const throwIfAborted = (signal) => {
    signal?.throwIfAborted();
};
export const makeLogicalIdentityEncoder = (sealing, database, scope) => {
    const cache = new Map();
    return {
        database,
        entity: (eid) => {
            let identity = cache.get(eid);
            if (identity !== undefined) {
                cache.delete(eid);
                cache.set(eid, identity);
                return identity;
            }
            if (cache.size >= MAX_ENTITY_CACHE) {
                cache.delete(cache.keys().next().value);
            }
            identity = Promise.all([
                makeEntityIdentity(sealing, database, eid),
                sealEntityId(sealing, scope, eid),
            ]).then(([wire, handle]) => Object.freeze({ identity: wire, handle }));
            cache.set(eid, identity);
            return identity;
        },
    };
};
const bind = (into, entity) => {
    if (into.has(entity.identity))
        return;
    into.set(entity.identity, Object.freeze({ entity: entity.identity, handle: entity.handle }));
};
export const entryHandles = (entries) => {
    const bindings = new Map();
    for (const entry of entries) {
        for (const binding of entry.handles) {
            if (!bindings.has(binding.entity))
                bindings.set(binding.entity, binding);
        }
    }
    return Object.freeze([...bindings.values()]);
};
const boundedText = (value) => {
    if (utf8.encode(value).byteLength > MAX_REPLICATION_STRING_BYTES) {
        throw new RangeError("replication string exceeds the wire bound");
    }
    return value;
};
const concat = (left, right) => {
    const out = new Uint8Array(left.byteLength + right.byteLength);
    out.set(left);
    out.set(right, left.byteLength);
    return out;
};
function* stringParts(value) {
    for (let offset = 0; offset < value.length; offset += MAX_STRING_PART_CODE_UNITS) {
        yield value.slice(offset, offset + MAX_STRING_PART_CODE_UNITS);
    }
}
function* byteParts(value) {
    for (let offset = 0; offset < value.byteLength; offset += MAX_REPLICATION_RAW_VALUE_PART_BYTES) {
        yield value.subarray(offset, offset + MAX_REPLICATION_RAW_VALUE_PART_BYTES);
    }
}
const utf16Bytes = (value) => {
    const out = new Uint8Array(value.length * 2);
    const view = new DataView(out.buffer);
    for (let index = 0; index < value.length; index++) {
        view.setUint16(index * 2, value.charCodeAt(index), false);
    }
    return out;
};
const valuePartIdentity = async (type, parts) => {
    let prior = new Uint8Array(32);
    for (const part of parts) {
        prior = new Uint8Array(await crypto.subtle.digest("SHA-256", concat(prior, part)));
    }
    return opaqueDigest(`ramose:replication:${type}-value:v1`, prior);
};
export async function* projectLogicalValueParts(datom, encoder, collect) {
    switch (datom.vt) {
        case ValueTag.Long:
            if (typeof datom.v !== "number" || !Number.isSafeInteger(datom.v)) {
                throw new TypeError("invalid logical long");
            }
            yield { type: "long", value: datom.v };
            return;
        case ValueTag.Double:
            if (typeof datom.v !== "number" || Number.isNaN(datom.v)) {
                throw new TypeError("invalid logical double");
            }
            yield {
                type: "double",
                value: datom.v === Number.POSITIVE_INFINITY
                    ? "positive-infinity"
                    : datom.v === Number.NEGATIVE_INFINITY
                        ? "negative-infinity"
                        : datom.v,
            };
            return;
        case ValueTag.Str: {
            if (typeof datom.v !== "string")
                throw new TypeError("invalid logical string");
            if (datom.v.length <= MAX_STRING_PART_CODE_UNITS) {
                yield { type: "string", value: boundedText(datom.v) };
                return;
            }
            const chunks = Math.ceil(datom.v.length / MAX_STRING_PART_CODE_UNITS);
            const identity = await valuePartIdentity("string", (function* () {
                for (const part of stringParts(datom.v))
                    yield utf16Bytes(part);
            })());
            let index = 0;
            for (const value of stringParts(datom.v)) {
                yield { type: "string-part", identity, index, chunks, value };
                index++;
            }
            return;
        }
        case ValueTag.Bool:
            if (typeof datom.v !== "boolean")
                throw new TypeError("invalid logical boolean");
            yield { type: "boolean", value: datom.v };
            return;
        case ValueTag.Ref:
            if (typeof datom.v !== "number" || !Number.isSafeInteger(datom.v) || datom.v < 0) {
                throw new TypeError("invalid logical reference");
            }
            {
                const referenced = await encoder.entity(datom.v);
                collect?.(referenced);
                yield { type: "ref", value: referenced.identity };
            }
            return;
        case ValueTag.Uuid:
            if (typeof datom.v !== "string")
                throw new TypeError("invalid logical uuid");
            yield { type: "uuid", value: datom.v };
            return;
        case ValueTag.Inst:
            if (typeof datom.v !== "number" || !Number.isSafeInteger(datom.v)) {
                throw new TypeError("invalid logical instant");
            }
            yield { type: "instant", value: datom.v };
            return;
        case ValueTag.Bytes: {
            if (!(datom.v instanceof Uint8Array))
                throw new TypeError("invalid logical bytes");
            if (datom.v.byteLength <= MAX_REPLICATION_RAW_VALUE_PART_BYTES) {
                yield { type: "bytes", value: bytesToBase64(datom.v) };
                return;
            }
            const chunks = Math.ceil(datom.v.byteLength / MAX_REPLICATION_RAW_VALUE_PART_BYTES);
            const identity = await valuePartIdentity("bytes", byteParts(datom.v));
            let index = 0;
            for (const part of byteParts(datom.v)) {
                yield {
                    type: "bytes-part",
                    identity,
                    index,
                    chunks,
                    value: bytesToBase64(part),
                };
                index++;
            }
            return;
        }
    }
}
export async function* projectLogicalDatoms(db, raw, encoder) {
    const attribute = db.attr(raw.a);
    if (attribute === undefined || !attribute.ident.startsWith(":")) {
        throw new TypeError("authorized datom has no logical field identity");
    }
    const entity = await encoder.entity(raw.e);
    const field = boundedText(attribute.ident);
    const bindings = new Map();
    bind(bindings, entity);
    for await (const value of projectLogicalValueParts(raw, encoder, (referenced) => bind(bindings, referenced))) {
        yield Object.freeze({
            datom: Object.freeze({
                entity: entity.identity,
                field,
                value,
                op: "add",
            }),
            handles: Object.freeze([...bindings.values()]),
        });
    }
}
export async function* logicalEntries(db, encoder, signal) {
    throwIfAborted(signal);
    for await (const chunk of db.datoms(Index.EAVT, {})) {
        for (const raw of chunk) {
            throwIfAborted(signal);
            for await (const projected of projectLogicalDatoms(db, raw, encoder)) {
                throwIfAborted(signal);
                yield Object.freeze({ raw, ...projected });
            }
        }
    }
}
class LogicalStateHasher {
    prior = new Uint8Array(32);
    block = "";
    bytes = 0;
    async add(datom) {
        const line = `${canonicalizeJson(datom)}\n`;
        const size = utf8.encode(line).byteLength;
        if (this.bytes > 0 && this.bytes + size > HASH_BLOCK_BYTES) {
            await this.flush();
        }
        this.block += line;
        this.bytes += size;
    }
    async flush() {
        const material = concat(this.prior, utf8.encode(this.block));
        const digest = await crypto.subtle.digest("SHA-256", material);
        this.prior = new Uint8Array(digest);
        this.block = "";
        this.bytes = 0;
    }
    async finish() {
        await this.flush();
        return opaqueDigest("ramose:replication:state:v1", this.prior);
    }
}
export const digestLogicalDb = async (db, encoder, signal) => {
    const hasher = new LogicalStateHasher();
    for await (const entry of logicalEntries(db, encoder, signal)) {
        await hasher.add(entry.datom);
    }
    throwIfAborted(signal);
    return hasher.finish();
};
const compareRawFact = (left, right) => {
    if (left.e !== right.e)
        return left.e < right.e ? -1 : 1;
    if (left.a !== right.a)
        return left.a < right.a ? -1 : 1;
    return compareValue(left.vt, left.v, right.vt, right.v);
};
const isValuePart = (value) => value.type === "string-part" || value.type === "bytes-part";
const asChangeDatom = (datom, op) => isValuePart(datom.value)
    ? undefined
    : Object.freeze({ ...datom, value: datom.value, op });
const encodedBytes = (value) => utf8.encode(JSON.stringify(value)).byteLength;
export const diffLogicalDbs = async (previous, current, encoder, signal) => {
    const before = logicalEntries(previous, encoder, signal)[Symbol.asyncIterator]();
    const after = logicalEntries(current, encoder, signal)[Symbol.asyncIterator]();
    const changes = [];
    const handles = new Map();
    let changeBytes = 0;
    let overflow = false;
    const hasher = new LogicalStateHasher();
    const previousHasher = new LogicalStateHasher();
    const appendChange = (entry, op) => {
        if (overflow)
            return;
        const change = asChangeDatom(entry.datom, op);
        if (change === undefined) {
            overflow = true;
            return;
        }
        const added = entry.handles.filter((binding) => !handles.has(binding.entity));
        const size = encodedBytes(change) + encodedBytes(added);
        if (changes.length >= MAX_REPLICATION_DATOMS_PER_CHANGE ||
            changeBytes + size > MAX_REPLICATION_CHANGE_BYTES) {
            overflow = true;
            return;
        }
        changes.push(change);
        for (const binding of added)
            handles.set(binding.entity, binding);
        changeBytes += size;
    };
    let left = await before.next();
    let right = await after.next();
    try {
        while (!left.done || !right.done) {
            if (left.done) {
                if (right.done)
                    break;
                const added = right.value;
                await hasher.add(added.datom);
                appendChange(added, "add");
                right = await after.next();
                continue;
            }
            if (right.done) {
                await previousHasher.add(left.value.datom);
                appendChange(left.value, "retract");
                left = await before.next();
                continue;
            }
            const order = compareRawFact(left.value.raw, right.value.raw);
            if (order === 0) {
                await previousHasher.add(left.value.datom);
                await hasher.add(right.value.datom);
                left = await before.next();
                right = await after.next();
            }
            else if (order < 0) {
                await previousHasher.add(left.value.datom);
                appendChange(left.value, "retract");
                left = await before.next();
            }
            else {
                await hasher.add(right.value.datom);
                appendChange(right.value, "add");
                right = await after.next();
            }
        }
    }
    finally {
        await before.return?.();
        await after.return?.();
    }
    throwIfAborted(signal);
    return Object.freeze({
        previousStateDigest: await previousHasher.finish(),
        stateDigest: await hasher.finish(),
        datoms: Object.freeze(changes),
        handles: Object.freeze([...handles.values()]),
        overflow,
    });
};
export async function* snapshotEntryChunks(db, encoder, fits, signal) {
    let chunk = [];
    let index = 0;
    for await (const entry of logicalEntries(db, encoder, signal)) {
        if (chunk.length > 0 &&
            (chunk.length >= MAX_REPLICATION_DATOMS_PER_SNAPSHOT_CHUNK ||
                !fits([...chunk, entry], index))) {
            yield Object.freeze(chunk);
            chunk = [];
            index++;
        }
        if (!fits([entry], index)) {
            throw new RangeError("one logical datom exceeds the snapshot frame bound");
        }
        chunk.push(entry);
    }
    if (chunk.length > 0)
        yield Object.freeze(chunk);
}
export const chunkStillAuthorized = async (current, chunk, signal) => {
    for (const entry of chunk) {
        throwIfAborted(signal);
        const raw = entry.raw;
        const found = await current.first(Index.EAVT, {
            e: raw.e,
            a: raw.a,
            vt: raw.vt,
            v: raw.v,
        });
        if (found === undefined)
            return false;
        const attribute = current.attr(raw.a);
        if (attribute === undefined || attribute.ident !== entry.datom.field)
            return false;
    }
    throwIfAborted(signal);
    return true;
};
//# sourceMappingURL=logical.js.map