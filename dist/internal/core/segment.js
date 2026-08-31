import { ByteReader, ByteWriter } from "./bytes.js";
import { ValueTag, bytesToUuid, uuidToBytes, } from "./datom.js";
const MAGIC = 0x52534731;
export function writeValue(w, vt, v) {
    w.u8(vt);
    switch (vt) {
        case ValueTag.Long:
        case ValueTag.Inst:
            w.svar(v);
            break;
        case ValueTag.Ref:
            w.uvar(v);
            break;
        case ValueTag.Double:
            w.f64(v);
            break;
        case ValueTag.Str:
            w.str(v);
            break;
        case ValueTag.Bool:
            w.u8(v ? 1 : 0);
            break;
        case ValueTag.Uuid:
            w.bytes(uuidToBytes(v));
            break;
        case ValueTag.Bytes:
            w.lbytes(v);
            break;
        default:
            throw new TypeError(`unknown value tag ${vt}`);
    }
}
export function readValue(r) {
    const vt = r.u8();
    switch (vt) {
        case ValueTag.Long:
        case ValueTag.Inst:
            return { vt, v: r.svar() };
        case ValueTag.Ref:
            return { vt, v: r.uvar() };
        case ValueTag.Double:
            return { vt, v: r.f64() };
        case ValueTag.Str:
            return { vt, v: r.str() };
        case ValueTag.Bool:
            return { vt, v: r.u8() !== 0 };
        case ValueTag.Uuid:
            return { vt, v: bytesToUuid(r.bytes(16), 0) };
        case ValueTag.Bytes:
            return { vt, v: r.lbytes().slice() };
        default:
            throw new TypeError(`unknown value tag ${vt}`);
    }
}
export function writeDatom(w, d) {
    w.uvar(d.e);
    w.uvar(d.a);
    writeValue(w, d.vt, d.v);
    w.uvar(d.t);
    w.u8(d.op ? 1 : 0);
}
export function readDatom(r) {
    const e = r.uvar();
    const a = r.uvar();
    const { vt, v } = readValue(r);
    const t = r.uvar();
    const op = r.u8() !== 0;
    return { e, a, vt, v, t, op };
}
export function encodeSegment(index, datoms) {
    const n = datoms.length;
    const w = new ByteWriter(Math.max(1024, n * 24));
    w.u32(MAGIC);
    w.u8(index);
    w.u32(n);
    let prev = 0;
    for (let i = 0; i < n; i++) {
        const e = datoms[i].e;
        w.svar(e - prev);
        prev = e;
    }
    for (let i = 0; i < n; i++)
        w.uvar(datoms[i].a);
    for (let i = 0; i < n; i++)
        writeValue(w, datoms[i].vt, datoms[i].v);
    prev = 0;
    for (let i = 0; i < n; i++) {
        const t = datoms[i].t;
        w.svar(t - prev);
        prev = t;
    }
    for (let i = 0; i < n; i += 8) {
        let b = 0;
        for (let j = 0; j < 8 && i + j < n; j++)
            if (datoms[i + j].op)
                b |= 1 << j;
        w.u8(b);
    }
    return w.finish();
}
export function decodeSegment(buf) {
    const r = new ByteReader(buf);
    if (r.u32() !== MAGIC)
        throw new Error("bad segment magic");
    const index = r.u8();
    const n = r.u32();
    const es = new Array(n);
    let prev = 0;
    for (let i = 0; i < n; i++) {
        prev += r.svar();
        es[i] = prev;
    }
    const as = new Array(n);
    for (let i = 0; i < n; i++)
        as[i] = r.uvar();
    const vts = new Array(n);
    const vs = new Array(n);
    for (let i = 0; i < n; i++) {
        const { vt, v } = readValue(r);
        vts[i] = vt;
        vs[i] = v;
    }
    const ts = new Array(n);
    prev = 0;
    for (let i = 0; i < n; i++) {
        prev += r.svar();
        ts[i] = prev;
    }
    const datoms = new Array(n);
    for (let i = 0; i < n; i += 8) {
        const b = r.u8();
        for (let j = 0; j < 8 && i + j < n; j++) {
            const k = i + j;
            datoms[k] = { e: es[k], a: as[k], vt: vts[k], v: vs[k], t: ts[k], op: (b & (1 << j)) !== 0 };
        }
    }
    return { index, datoms };
}
//# sourceMappingURL=segment.js.map