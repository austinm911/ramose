import { ByteReader, ByteWriter } from "./bytes.js";
import { ValueTag } from "./datom.js";
import { readValue, writeValue } from "./segment.js";
const LOG_MAGIC = 0x524c4731;
export function encodeLogChunk(entries) {
    const w = new ByteWriter();
    w.u32(LOG_MAGIC);
    w.uvar(entries.length);
    for (const e of entries) {
        w.uvar(e.t);
        w.uvar(e.txInstant);
        w.uvar(e.datoms.length);
        for (const d of e.datoms) {
            w.uvar(d.e);
            w.uvar(d.a);
            writeValue(w, d.vt, d.v);
            w.u8(d.op ? 1 : 0);
        }
    }
    return w.finish();
}
export function decodeLogChunk(buf) {
    const r = new ByteReader(buf);
    if (r.u32() !== LOG_MAGIC)
        throw new Error("bad log chunk magic");
    const n = r.uvar();
    const out = [];
    for (let i = 0; i < n; i++) {
        const t = r.uvar();
        const txInstant = r.uvar();
        const m = r.uvar();
        const datoms = new Array(m);
        for (let j = 0; j < m; j++) {
            const e = r.uvar();
            const a = r.uvar();
            const { vt, v } = readValue(r);
            const op = r.u8() !== 0;
            datoms[j] = { e, a, vt, v, t, op };
        }
        out.push({ t, txInstant, datoms });
    }
    return out;
}
export function toWireDatom(d) {
    let v;
    if (d.vt === ValueTag.Bytes)
        v = bytesToBase64(d.v);
    else
        v = d.v;
    return [d.e, d.a, d.vt, v, d.t, d.op ? 1 : 0];
}
export function fromWireDatom(w) {
    const vt = w[2];
    const v = vt === ValueTag.Bytes ? base64ToBytes(w[3]) : w[3];
    return { e: w[0], a: w[1], vt, v, t: w[4], op: w[5] === 1 };
}
export function txFrame(entry) {
    return { v: 1, kind: "tx", t: entry.t, txInstant: entry.txInstant, datoms: entry.datoms.map(toWireDatom) };
}
export function entryFromFrame(f) {
    return { t: f.t, txInstant: f.txInstant, datoms: f.datoms.map(fromWireDatom) };
}
export function bytesToBase64(b) {
    let s = "";
    for (let i = 0; i < b.length; i++)
        s += String.fromCharCode(b[i]);
    return btoa(s);
}
export function base64ToBytes(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        out[i] = bin.charCodeAt(i);
    return out;
}
//# sourceMappingURL=log.js.map