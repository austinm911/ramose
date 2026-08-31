export const ValueTag = {
    Long: 1,
    Double: 2,
    Str: 3,
    Bool: 4,
    Ref: 5,
    Uuid: 6,
    Inst: 7,
    Bytes: 8,
};
export const ValueTagName = {
    1: "long",
    2: "double",
    3: "string",
    4: "boolean",
    5: "ref",
    6: "uuid",
    7: "instant",
    8: "bytes",
};
export function datom(e, a, vt, v, t, op = true) {
    return { e, a, vt, v: normalizeValue(vt, v), t, op };
}
export const MAX_ID = Number.MAX_SAFE_INTEGER;
export function normalizeValue(vt, v) {
    switch (vt) {
        case ValueTag.Long:
        case ValueTag.Ref:
        case ValueTag.Inst:
            if (typeof v !== "number" || !Number.isSafeInteger(v)) {
                throw new TypeError(`${ValueTagName[vt]} value must be a safe integer, got ${String(v)}`);
            }
            if (vt === ValueTag.Ref && v < 0)
                throw new TypeError(`ref must be non-negative`);
            return v;
        case ValueTag.Double:
            if (typeof v !== "number")
                throw new TypeError(`double value must be a number`);
            if (Number.isNaN(v))
                throw new TypeError(`double value must not be NaN`);
            return v + 0;
        case ValueTag.Str:
            if (typeof v !== "string")
                throw new TypeError(`string value must be a string`);
            return v;
        case ValueTag.Bool:
            if (typeof v !== "boolean")
                throw new TypeError(`boolean value must be a boolean`);
            return v;
        case ValueTag.Uuid: {
            if (typeof v !== "string")
                throw new TypeError(`uuid value must be a string`);
            const s = v.toLowerCase();
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) {
                throw new TypeError(`invalid uuid: ${v}`);
            }
            return s;
        }
        case ValueTag.Bytes:
            if (!(v instanceof Uint8Array))
                throw new TypeError(`bytes value must be a Uint8Array`);
            return v;
        default:
            throw new TypeError(`unknown value tag ${vt}`);
    }
}
export function compareStrings(a, b) {
    if (a === b)
        return 0;
    const n = a.length < b.length ? a.length : b.length;
    for (let i = 0; i < n; i++) {
        let x = a.charCodeAt(i);
        let y = b.charCodeAt(i);
        if (x !== y) {
            if (x >= 0xd800 && y >= 0xd800) {
                if (x >= 0xe000)
                    x -= 0x800;
                else
                    x += 0x2000;
                if (y >= 0xe000)
                    y -= 0x800;
                else
                    y += 0x2000;
            }
            return x < y ? -1 : 1;
        }
    }
    return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
}
export function compareBytes(a, b) {
    const n = a.length < b.length ? a.length : b.length;
    for (let i = 0; i < n; i++) {
        const d = a[i] - b[i];
        if (d !== 0)
            return d < 0 ? -1 : 1;
    }
    return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
}
export function compareValue(at, av, bt, bv) {
    if (at !== bt)
        return at < bt ? -1 : 1;
    switch (at) {
        case ValueTag.Long:
        case ValueTag.Double:
        case ValueTag.Ref:
        case ValueTag.Inst: {
            const x = av, y = bv;
            return x < y ? -1 : x > y ? 1 : 0;
        }
        case ValueTag.Str:
            return compareStrings(av, bv);
        case ValueTag.Bool: {
            const x = av ? 1 : 0, y = bv ? 1 : 0;
            return x - y;
        }
        case ValueTag.Uuid: {
            const x = av, y = bv;
            return x < y ? -1 : x > y ? 1 : 0;
        }
        case ValueTag.Bytes:
            return compareBytes(av, bv);
        default:
            throw new TypeError(`unknown value tag ${at}`);
    }
}
export function valueEquals(at, av, bt, bv) {
    if (at !== bt)
        return false;
    if (av === bv)
        return true;
    if (typeof av !== "object" || typeof bv !== "object")
        return typeof av === "number" && typeof bv === "number" && av !== av && bv !== bv;
    return compareValue(at, av, bt, bv) === 0;
}
export const Index = {
    EAVT: 0,
    AEVT: 1,
    AVET: 2,
    VAET: 3,
};
export const IndexName = { 0: "eavt", 1: "aevt", 2: "avet", 3: "vaet" };
export const ALL_INDEXES = [Index.EAVT, Index.AEVT, Index.AVET, Index.VAET];
function cmpNum(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
function cmpOp(a, b) {
    return a === b ? 0 : a ? 1 : -1;
}
export function cmpEAVT(x, y) {
    return (cmpNum(x.e, y.e) ||
        cmpNum(x.a, y.a) ||
        compareValue(x.vt, x.v, y.vt, y.v) ||
        cmpNum(x.t, y.t) ||
        cmpOp(x.op, y.op));
}
export function cmpAEVT(x, y) {
    return (cmpNum(x.a, y.a) ||
        cmpNum(x.e, y.e) ||
        compareValue(x.vt, x.v, y.vt, y.v) ||
        cmpNum(x.t, y.t) ||
        cmpOp(x.op, y.op));
}
export function cmpAVET(x, y) {
    return (cmpNum(x.a, y.a) ||
        compareValue(x.vt, x.v, y.vt, y.v) ||
        cmpNum(x.e, y.e) ||
        cmpNum(x.t, y.t) ||
        cmpOp(x.op, y.op));
}
export function cmpVAET(x, y) {
    return (compareValue(x.vt, x.v, y.vt, y.v) ||
        cmpNum(x.a, y.a) ||
        cmpNum(x.e, y.e) ||
        cmpNum(x.t, y.t) ||
        cmpOp(x.op, y.op));
}
export const COMPARATORS = {
    0: cmpEAVT,
    1: cmpAEVT,
    2: cmpAVET,
    3: cmpVAET,
};
export function comparatorFor(index) {
    return COMPARATORS[index];
}
export function datomEquals(x, y) {
    return x.e === y.e && x.a === y.a && x.t === y.t && x.op === y.op && valueEquals(x.vt, x.v, y.vt, y.v);
}
export function comparePrefix(index, d, p) {
    let c;
    switch (index) {
        case Index.EAVT:
            if (p.e === undefined)
                return 0;
            if ((c = cmpNum(d.e, p.e)) !== 0)
                return c;
            if (p.a === undefined)
                return 0;
            if ((c = cmpNum(d.a, p.a)) !== 0)
                return c;
            if (p.vt === undefined)
                return 0;
            if ((c = compareValue(d.vt, d.v, p.vt, p.v)) !== 0)
                return c;
            if (p.t === undefined)
                return 0;
            return cmpNum(d.t, p.t);
        case Index.AEVT:
            if (p.a === undefined)
                return 0;
            if ((c = cmpNum(d.a, p.a)) !== 0)
                return c;
            if (p.e === undefined)
                return 0;
            if ((c = cmpNum(d.e, p.e)) !== 0)
                return c;
            if (p.vt === undefined)
                return 0;
            if ((c = compareValue(d.vt, d.v, p.vt, p.v)) !== 0)
                return c;
            if (p.t === undefined)
                return 0;
            return cmpNum(d.t, p.t);
        case Index.AVET:
            if (p.a === undefined)
                return 0;
            if ((c = cmpNum(d.a, p.a)) !== 0)
                return c;
            if (p.vt === undefined)
                return 0;
            if ((c = compareValue(d.vt, d.v, p.vt, p.v)) !== 0)
                return c;
            if (p.e === undefined)
                return 0;
            if ((c = cmpNum(d.e, p.e)) !== 0)
                return c;
            if (p.t === undefined)
                return 0;
            return cmpNum(d.t, p.t);
        case Index.VAET:
            if (p.vt === undefined)
                return 0;
            if ((c = compareValue(d.vt, d.v, p.vt, p.v)) !== 0)
                return c;
            if (p.a === undefined)
                return 0;
            if ((c = cmpNum(d.a, p.a)) !== 0)
                return c;
            if (p.e === undefined)
                return 0;
            if ((c = cmpNum(d.e, p.e)) !== 0)
                return c;
            if (p.t === undefined)
                return 0;
            return cmpNum(d.t, p.t);
        default:
            throw new Error(`unknown index ${index}`);
    }
}
export function prefixDepth(index, p) {
    const has = (k) => k === "v" ? p.vt !== undefined : p[k] !== undefined;
    const order = INDEX_ORDER[index];
    let n = 0;
    for (const k of order) {
        if (has(k))
            n++;
        else
            break;
    }
    return n;
}
export const INDEX_ORDER = {
    0: ["e", "a", "v", "t"],
    1: ["a", "e", "v", "t"],
    2: ["a", "v", "e", "t"],
    3: ["v", "a", "e", "t"],
};
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: false });
const SIGN_FLIP = 1n << 63n;
export function encodeI64(n, out, off) {
    const b = BigInt.asUintN(64, BigInt(n)) ^ SIGN_FLIP;
    const hi = Number(b >> 32n) >>> 0;
    const lo = Number(b & 0xffffffffn) >>> 0;
    out[off] = hi >>> 24;
    out[off + 1] = (hi >>> 16) & 0xff;
    out[off + 2] = (hi >>> 8) & 0xff;
    out[off + 3] = hi & 0xff;
    out[off + 4] = lo >>> 24;
    out[off + 5] = (lo >>> 16) & 0xff;
    out[off + 6] = (lo >>> 8) & 0xff;
    out[off + 7] = lo & 0xff;
}
export function decodeI64(buf, off) {
    const hi = ((buf[off] << 24) >>> 0) + (buf[off + 1] << 16) + (buf[off + 2] << 8) + buf[off + 3];
    const lo = ((buf[off + 4] << 24) >>> 0) + (buf[off + 5] << 16) + (buf[off + 6] << 8) + buf[off + 7];
    const u = (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0);
    return BigInt.asIntN(64, u ^ SIGN_FLIP);
}
export function encodeU64(n, out, off) {
    const hi = Math.floor(n / 0x100000000) >>> 0;
    const lo = (n % 0x100000000) >>> 0;
    out[off] = hi >>> 24;
    out[off + 1] = (hi >>> 16) & 0xff;
    out[off + 2] = (hi >>> 8) & 0xff;
    out[off + 3] = hi & 0xff;
    out[off + 4] = lo >>> 24;
    out[off + 5] = (lo >>> 16) & 0xff;
    out[off + 6] = (lo >>> 8) & 0xff;
    out[off + 7] = lo & 0xff;
}
export function decodeU64(buf, off) {
    const hi = ((buf[off] << 24) >>> 0) + (buf[off + 1] << 16) + (buf[off + 2] << 8) + buf[off + 3];
    const lo = ((buf[off + 4] << 24) >>> 0) + (buf[off + 5] << 16) + (buf[off + 6] << 8) + buf[off + 7];
    return hi * 0x100000000 + lo;
}
const f64buf = new DataView(new ArrayBuffer(8));
export function encodeF64(x, out, off) {
    f64buf.setFloat64(0, x + 0, false);
    let hi = f64buf.getUint32(0, false);
    let lo = f64buf.getUint32(4, false);
    if (hi & 0x80000000) {
        hi = ~hi >>> 0;
        lo = ~lo >>> 0;
    }
    else {
        hi = (hi | 0x80000000) >>> 0;
    }
    out[off] = hi >>> 24;
    out[off + 1] = (hi >>> 16) & 0xff;
    out[off + 2] = (hi >>> 8) & 0xff;
    out[off + 3] = hi & 0xff;
    out[off + 4] = lo >>> 24;
    out[off + 5] = (lo >>> 16) & 0xff;
    out[off + 6] = (lo >>> 8) & 0xff;
    out[off + 7] = lo & 0xff;
}
export function decodeF64(buf, off) {
    let hi = ((buf[off] << 24) >>> 0) + (buf[off + 1] << 16) + (buf[off + 2] << 8) + buf[off + 3];
    let lo = ((buf[off + 4] << 24) >>> 0) + (buf[off + 5] << 16) + (buf[off + 6] << 8) + buf[off + 7];
    if (hi & 0x80000000) {
        hi = (hi & 0x7fffffff) >>> 0;
    }
    else {
        hi = ~hi >>> 0;
        lo = ~lo >>> 0;
    }
    f64buf.setUint32(0, hi, false);
    f64buf.setUint32(4, lo, false);
    return f64buf.getFloat64(0, false);
}
export function uuidToBytes(u) {
    const hex = u.replace(/-/g, "");
    const out = new Uint8Array(16);
    for (let i = 0; i < 16; i++)
        out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
}
export function bytesToUuid(b, off = 0) {
    let s = "";
    for (let i = 0; i < 16; i++) {
        s += b[off + i].toString(16).padStart(2, "0");
        if (i === 3 || i === 5 || i === 7 || i === 9)
            s += "-";
    }
    return s;
}
export function encodeValue(vt, v) {
    switch (vt) {
        case ValueTag.Long:
        case ValueTag.Inst: {
            const out = new Uint8Array(9);
            out[0] = vt;
            encodeI64(v, out, 1);
            return out;
        }
        case ValueTag.Ref: {
            const out = new Uint8Array(9);
            out[0] = vt;
            encodeU64(v, out, 1);
            return out;
        }
        case ValueTag.Double: {
            const out = new Uint8Array(9);
            out[0] = vt;
            encodeF64(v, out, 1);
            return out;
        }
        case ValueTag.Str: {
            const s = textEncoder.encode(v);
            const out = new Uint8Array(1 + s.length);
            out[0] = vt;
            out.set(s, 1);
            return out;
        }
        case ValueTag.Bool: {
            return Uint8Array.of(vt, v ? 1 : 0);
        }
        case ValueTag.Uuid: {
            const out = new Uint8Array(17);
            out[0] = vt;
            out.set(uuidToBytes(v), 1);
            return out;
        }
        case ValueTag.Bytes: {
            const b = v;
            const out = new Uint8Array(1 + b.length);
            out[0] = vt;
            out.set(b, 1);
            return out;
        }
        default:
            throw new TypeError(`unknown value tag ${vt}`);
    }
}
export function decodeValue(buf) {
    const vt = buf[0];
    switch (vt) {
        case ValueTag.Long:
        case ValueTag.Inst:
            return { vt, v: Number(decodeI64(buf, 1)) };
        case ValueTag.Ref:
            return { vt, v: decodeU64(buf, 1) };
        case ValueTag.Double:
            return { vt, v: decodeF64(buf, 1) };
        case ValueTag.Str:
            return { vt, v: textDecoder.decode(buf.subarray(1)) };
        case ValueTag.Bool:
            return { vt, v: buf[1] !== 0 };
        case ValueTag.Uuid:
            return { vt, v: bytesToUuid(buf, 1) };
        case ValueTag.Bytes:
            return { vt, v: buf.slice(1) };
        default:
            throw new TypeError(`unknown value tag ${vt}`);
    }
}
export function inferTag(v) {
    switch (typeof v) {
        case "number":
            return Number.isInteger(v) ? { vt: ValueTag.Long, v } : { vt: ValueTag.Double, v };
        case "bigint":
            return { vt: ValueTag.Long, v: Number(v) };
        case "string":
            return { vt: ValueTag.Str, v };
        case "boolean":
            return { vt: ValueTag.Bool, v };
        case "object":
            if (v instanceof Date)
                return { vt: ValueTag.Inst, v: v.getTime() };
            if (v instanceof Uint8Array)
                return { vt: ValueTag.Bytes, v };
            if (v && typeof v === "object" && "vt" in v && "v" in v)
                return v;
            break;
    }
    throw new TypeError(`cannot infer value type for ${String(v)}`);
}
export function toJsValue(vt, v) {
    if (vt === ValueTag.Inst)
        return new Date(v);
    return v;
}
export function valueKey(vt, v) {
    switch (vt) {
        case ValueTag.Bytes: {
            const b = v;
            let s = "";
            for (let i = 0; i < b.length; i++)
                s += String.fromCharCode(b[i]);
            return "8:" + s;
        }
        default:
            return vt + ":" + String(v);
    }
}
//# sourceMappingURL=datom.js.map