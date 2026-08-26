/**
 * Small growable byte writer / reader with LEB128 varints. Shared by the
 * segment and directory-node codecs. Pure TS.
 */
const ENC = new TextEncoder();
const DEC = new TextDecoder();
export class ByteWriter {
    buf;
    view;
    pos = 0;
    constructor(initial = 4096) {
        this.buf = new Uint8Array(initial);
        this.view = new DataView(this.buf.buffer);
    }
    ensure(n) {
        if (this.pos + n <= this.buf.length)
            return;
        let cap = this.buf.length * 2;
        while (cap < this.pos + n)
            cap *= 2;
        const nb = new Uint8Array(cap);
        nb.set(this.buf.subarray(0, this.pos));
        this.buf = nb;
        this.view = new DataView(nb.buffer);
    }
    u8(x) {
        this.ensure(1);
        this.buf[this.pos++] = x & 0xff;
    }
    u32(x) {
        this.ensure(4);
        this.view.setUint32(this.pos, x >>> 0, false);
        this.pos += 4;
    }
    /** unsigned LEB128; supports safe integers (up to 2^53). */
    uvar(x) {
        if (x < 0 || !Number.isSafeInteger(x))
            throw new RangeError(`uvar: bad value ${x}`);
        this.ensure(10);
        while (x >= 0x80) {
            this.buf[this.pos++] = (x % 0x80) | 0x80;
            x = Math.floor(x / 0x80);
        }
        this.buf[this.pos++] = x;
    }
    /**
     * zig-zag signed varint over the full safe-integer range.
     * Wire format is identical to LEB128 of zigzag(x) = 2|x| - neg, but computed
     * without ever materialising 2|x| (which overflows 2^53 for |x| > 2^52):
     * first byte carries the sign bit + 6 magnitude bits, remainder is uvar.
     */
    svar(x) {
        if (!Number.isSafeInteger(x))
            throw new RangeError(`svar: bad value ${x}`);
        const neg = x < 0 ? 1 : 0;
        const m = neg ? -x - 1 : x; // zigzag = 2m + neg
        const rest = Math.floor(m / 64);
        const low = ((m % 64) << 1) | neg;
        this.ensure(1);
        if (rest === 0) {
            this.buf[this.pos++] = low;
        }
        else {
            this.buf[this.pos++] = low | 0x80;
            this.uvar(rest);
        }
    }
    f64(x) {
        this.ensure(8);
        this.view.setFloat64(this.pos, x, false);
        this.pos += 8;
    }
    bytes(b) {
        this.ensure(b.length);
        this.buf.set(b, this.pos);
        this.pos += b.length;
    }
    /** length-prefixed bytes */
    lbytes(b) {
        this.uvar(b.length);
        this.bytes(b);
    }
    str(s) {
        this.lbytes(ENC.encode(s));
    }
    /** Reserve `n` bytes at the current position; returns offset for later patch. */
    reserve(n) {
        this.ensure(n);
        const off = this.pos;
        this.pos += n;
        return off;
    }
    patchU32(off, x) {
        this.view.setUint32(off, x >>> 0, false);
    }
    finish() {
        return this.buf.slice(0, this.pos);
    }
}
export class ByteReader {
    buf;
    pos;
    view;
    constructor(buf, pos = 0) {
        this.buf = buf;
        this.pos = pos;
        this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    get remaining() {
        return this.buf.length - this.pos;
    }
    u8() {
        if (this.pos >= this.buf.length)
            throw new RangeError("ByteReader: EOF");
        return this.buf[this.pos++];
    }
    u32() {
        const x = this.view.getUint32(this.pos, false);
        this.pos += 4;
        return x;
    }
    uvar() {
        let result = 0;
        let mult = 1;
        for (;;) {
            if (this.pos >= this.buf.length)
                throw new RangeError("ByteReader: EOF in varint");
            const b = this.buf[this.pos++];
            result += (b & 0x7f) * mult;
            if ((b & 0x80) === 0)
                return result;
            mult *= 0x80;
            if (mult > 2 ** 56)
                throw new RangeError("varint too long");
        }
    }
    svar() {
        // Inverse of ByteWriter.svar: decode without materialising 2|x|.
        const b = this.u8();
        const neg = b & 1;
        let m = (b >> 1) & 0x3f;
        if (b & 0x80)
            m += this.uvar() * 64;
        return neg ? -m - 1 : m;
    }
    f64() {
        const x = this.view.getFloat64(this.pos, false);
        this.pos += 8;
        return x;
    }
    bytes(n) {
        if (this.pos + n > this.buf.length)
            throw new RangeError("ByteReader: EOF in bytes");
        const b = this.buf.subarray(this.pos, this.pos + n);
        this.pos += n;
        return b;
    }
    lbytes() {
        return this.bytes(this.uvar());
    }
    str() {
        return DEC.decode(this.lbytes());
    }
}
export function concatBytes(parts) {
    let n = 0;
    for (const p of parts)
        n += p.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
}
export function bytesEqual(a, b) {
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++)
        if (a[i] !== b[i])
            return false;
    return true;
}
const HEX = "0123456789abcdef";
export function toHex(b) {
    let s = "";
    for (let i = 0; i < b.length; i++)
        s += HEX[b[i] >> 4] + HEX[b[i] & 15];
    return s;
}
export function fromHex(h) {
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < out.length; i++)
        out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
}
/** SHA-256 hex digest via WebCrypto (available in Bun, Node ≥ 19, Workers). */
export async function sha256Hex(data) {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return toHex(new Uint8Array(digest));
}
/** gzip via the standard CompressionStream (Bun, Node ≥ 18, Workers). */
export async function gzip(data) {
    return pipeThrough(new CompressionStream("gzip"), data);
}
/** Rejects (never crashes) on truncated / corrupt input. */
export async function gunzip(data) {
    return pipeThrough(new DecompressionStream("gzip"), data);
}
async function pipeThrough(ts, data) {
    const w = ts.writable.getWriter();
    // Both halves are awaited together so a failure on either side surfaces
    // as this promise's rejection instead of an unhandled rejection.
    const written = w.write(data).then(() => w.close());
    const [buf] = await Promise.all([new Response(ts.readable).arrayBuffer(), written]);
    return new Uint8Array(buf);
}
//# sourceMappingURL=bytes.js.map