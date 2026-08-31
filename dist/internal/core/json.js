import { ValueTag } from "./datom.js";
import { base64ToBytes, bytesToBase64 } from "./log.js";
export function toJson(v) {
    if (v === null || v === undefined)
        return v ?? null;
    if (v instanceof Date)
        return { $inst: v.getTime() };
    if (v instanceof Uint8Array)
        return { $bytes: bytesToBase64(v) };
    if (typeof v === "bigint")
        return Number(v);
    if (Array.isArray(v))
        return v.map(toJson);
    if (v instanceof Set)
        return [...v].map(toJson);
    if (v instanceof Map)
        return Object.fromEntries([...v].map(([k, x]) => [String(k), toJson(x)]));
    if (typeof v === "object") {
        const o = v;
        if ("vt" in o && "v" in o && Object.keys(o).length === 2) {
            if (o.vt === ValueTag.Uuid)
                return { $uuid: o.v };
            if (o.vt === ValueTag.Inst)
                return { $inst: o.v };
            if (o.vt === ValueTag.Bytes)
                return { $bytes: bytesToBase64(o.v) };
            return toJson(o.v);
        }
        const out = {};
        for (const [k, x] of Object.entries(o))
            out[k] = toJson(x);
        return out;
    }
    return v;
}
export function fromJson(v) {
    if (v === null || typeof v !== "object")
        return v;
    if (Array.isArray(v))
        return v.map(fromJson);
    const o = v;
    const keys = Object.keys(o);
    if (keys.length === 1) {
        if ("$inst" in o)
            return new Date(typeof o.$inst === "number" ? o.$inst : Date.parse(String(o.$inst)));
        if ("$bytes" in o)
            return base64ToBytes(String(o.$bytes));
        if ("$uuid" in o)
            return String(o.$uuid).toLowerCase();
    }
    const out = {};
    for (const [k, x] of Object.entries(o))
        out[k] = fromJson(x);
    return out;
}
export function stringifyJson(v) {
    return JSON.stringify(toJson(v));
}
export function parseJson(s) {
    return fromJson(JSON.parse(s));
}
//# sourceMappingURL=json.js.map