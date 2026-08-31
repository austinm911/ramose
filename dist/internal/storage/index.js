import { decodeLogChunk, deserializeNode, encodeLogChunk, gzipCodec, objectKey, reachable, serializeNode, } from "../core/index.js";
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const dbPrefix = (db) => `db/${db}/`;
export function prefixedBucket(bucket, prefix) {
    const k = (key) => prefix + key;
    return {
        get: (key) => bucket.get(k(key)),
        put: (key, value, options) => bucket.put(k(key), value, options),
        head: (key) => bucket.head(k(key)),
        delete: (keys) => bucket.delete(Array.isArray(keys) ? keys.map(k) : k(keys)),
        list: async (options = {}) => {
            const page = await bucket.list({ ...options, prefix: prefix + (options.prefix ?? "") });
            return { ...page, objects: page.objects.map((o) => ({ ...o, key: o.key.slice(prefix.length) })) };
        },
    };
}
export const ROOT_CACHE_CONTROL = "no-store";
export class R2NodeStore {
    bucket;
    codec;
    mem = new Map();
    maxNodes;
    tier;
    cache;
    headBeforePut;
    inflight = new Map();
    stats = { peekHits: 0, memHits: 0, tierHits: 0, cacheHits: 0, r2Gets: 0, r2Puts: 0, r2PutSkipped: 0, bytesRead: 0, bytesWritten: 0 };
    constructor(bucket, opts = {}) {
        this.bucket = bucket;
        this.codec = opts.codec ?? gzipCodec;
        this.maxNodes = opts.maxNodes ?? 2048;
        this.tier = opts.tier;
        this.cache = opts.cache;
        this.headBeforePut = opts.headBeforePut ?? false;
    }
    peek(hash) {
        const n = this.mem.get(hash);
        if (n !== undefined) {
            this.stats.peekHits++;
            this.mem.delete(hash);
            this.mem.set(hash, n);
        }
        return n;
    }
    remember(hash, node) {
        this.mem.set(hash, node);
        if (this.mem.size > this.maxNodes) {
            const oldest = this.mem.keys().next().value;
            this.mem.delete(oldest);
        }
    }
    async load(ref) {
        const m = this.mem.get(ref.hash);
        if (m !== undefined) {
            this.stats.memHits++;
            return m;
        }
        const pending = this.inflight.get(ref.hash);
        if (pending)
            return pending;
        const p = this.loadUncached(ref).finally(() => this.inflight.delete(ref.hash));
        this.inflight.set(ref.hash, p);
        return p;
    }
    async loadUncached(ref) {
        const key = objectKey(ref.kind, ref.hash);
        let body;
        if (this.tier) {
            body = await this.tier.get(key);
            if (body && body.length > 0) {
                try {
                    const node = await deserializeNode(body, this.codec);
                    this.stats.tierHits++;
                    this.remember(ref.hash, node);
                    return node;
                }
                catch {
                }
            }
        }
        if (this.cache) {
            body = await this.cache.match(key);
            if (body && body.length > 0) {
                try {
                    const node = await deserializeNode(body, this.codec);
                    this.stats.cacheHits++;
                    this.remember(ref.hash, node);
                    return node;
                }
                catch {
                }
            }
        }
        const obj = await this.bucket.get(key);
        if (!obj)
            throw new Error(`R2NodeStore: missing object ${key}`);
        body = new Uint8Array(await obj.arrayBuffer());
        this.stats.r2Gets++;
        this.stats.bytesRead += body.length;
        const node = await deserializeNode(body, this.codec);
        if (this.cache)
            this.cache.put(key, body.slice()).catch(() => undefined);
        if (this.tier)
            await Promise.resolve(this.tier.put(key, body.slice())).catch(() => undefined);
        this.remember(ref.hash, node);
        return node;
    }
    async put(index, node) {
        const { ref, body } = await serializeNode(index, node, this.codec);
        const key = objectKey(ref.kind, ref.hash);
        let exists = false;
        if (this.headBeforePut)
            exists = (await this.bucket.head(key)) !== null;
        if (!exists) {
            await this.bucket.put(key, body, { httpMetadata: { cacheControl: IMMUTABLE_CACHE_CONTROL, contentType: "application/octet-stream" } });
            this.stats.r2Puts++;
            this.stats.bytesWritten += body.length;
        }
        else
            this.stats.r2PutSkipped++;
        if (this.tier)
            await Promise.resolve(this.tier.put(key, body.slice())).catch(() => undefined);
        this.remember(ref.hash, node);
        return ref;
    }
    clearMemory() {
        this.mem.clear();
    }
}
export function cacheApiTier(cache, origin = "https://ramose-cache.invalid") {
    return {
        async match(key) {
            const req = new Request(`${origin}/${key}`);
            const res = await cache.match(req);
            if (!res)
                return undefined;
            const body = new Uint8Array(await res.arrayBuffer());
            const declared = Number(res.headers.get("content-length") ?? body.length);
            if (body.length === 0 || (Number.isFinite(declared) && declared !== body.length)) {
                Promise.resolve(cache.delete(req)).catch(() => undefined);
                return undefined;
            }
            return body;
        },
        async put(key, body) {
            await cache.put(new Request(`${origin}/${key}`), new Response(body, { headers: { "Cache-Control": IMMUTABLE_CACHE_CONTROL, "Content-Type": "application/octet-stream" } }));
        },
    };
}
export const ROOT_CURRENT_KEY = "root/current";
export const rootKey = (t) => `roots/${String(t).padStart(12, "0")}`;
export function rootsToRecord(roots, extra) {
    const ref = (r) => ({ hash: r.hash, kind: r.kind, count: r.count });
    return {
        v: 1,
        t: roots.t,
        eavt: ref(roots.eavt),
        aevt: ref(roots.aevt),
        avet: ref(roots.avet),
        vaet: ref(roots.vaet),
        log_watermark: extra.log_watermark,
        next_eid: extra.next_eid,
        codec: extra.codec,
        created_at: extra.created_at ?? Date.now(),
    };
}
export function recordToRoots(rec) {
    const ref = (r) => ({ hash: r.hash, kind: r.kind, count: r.count });
    return { t: rec.t, eavt: ref(rec.eavt), aevt: ref(rec.aevt), avet: ref(rec.avet), vaet: ref(rec.vaet) };
}
export async function readCurrentRoot(bucket) {
    const obj = await bucket.get(ROOT_CURRENT_KEY);
    if (!obj)
        return null;
    return JSON.parse(await obj.text());
}
export async function readRootAt(bucket, t) {
    const obj = await bucket.get(rootKey(t));
    if (!obj)
        return null;
    return JSON.parse(await obj.text());
}
export async function publishRoot(bucket, rec) {
    const body = JSON.stringify(rec);
    await bucket.put(rootKey(rec.t), body, { httpMetadata: { cacheControl: IMMUTABLE_CACHE_CONTROL, contentType: "application/json" } });
    await bucket.put(ROOT_CURRENT_KEY, body, { httpMetadata: { cacheControl: ROOT_CACHE_CONTROL, contentType: "application/json" } });
}
export async function listRoots(bucket) {
    const ts = [];
    let cursor;
    do {
        const page = await bucket.list({ prefix: "roots/", ...(cursor !== undefined && { cursor }), limit: 1000 });
        for (const o of page.objects)
            ts.push(Number(o.key.slice("roots/".length)));
        cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return ts.sort((a, b) => a - b);
}
export const logKey = (t0, t1) => `log/${String(t0).padStart(12, "0")}-${String(t1).padStart(12, "0")}`;
export async function putLogChunk(bucket, entries, codec = gzipCodec) {
    if (entries.length === 0)
        throw new Error("empty log chunk");
    const key = logKey(entries[0].t, entries[entries.length - 1].t);
    const body = await codec.compress(encodeLogChunk(entries));
    await bucket.put(key, body, { httpMetadata: { cacheControl: IMMUTABLE_CACHE_CONTROL, contentType: "application/octet-stream" } });
    return key;
}
export async function listLogChunks(bucket, sinceT = 0) {
    const out = [];
    let cursor;
    do {
        const page = await bucket.list({ prefix: "log/", ...(cursor !== undefined && { cursor }), limit: 1000 });
        for (const o of page.objects) {
            const m = /^log\/(\d+)-(\d+)$/.exec(o.key);
            if (!m)
                continue;
            const t0 = Number(m[1]), t1 = Number(m[2]);
            if (t1 > sinceT)
                out.push({ key: o.key, t0, t1 });
        }
        cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return out.sort((a, b) => a.t0 - b.t0);
}
export async function readLogChunk(bucket, key, codec = gzipCodec) {
    const obj = await bucket.get(key);
    if (!obj)
        throw new Error(`missing log chunk ${key}`);
    return decodeLogChunk(await codec.decompress(new Uint8Array(await obj.arrayBuffer())));
}
export async function readLogSince(bucket, sinceT, untilT = Infinity, codec = gzipCodec) {
    const chunks = await listLogChunks(bucket, sinceT);
    const out = [];
    for (const c of chunks) {
        if (c.t0 > untilT)
            break;
        for (const e of await readLogChunk(bucket, c.key, codec))
            if (e.t > sinceT && e.t <= untilT)
                out.push(e);
    }
    return out;
}
export async function gcSweep(bucket, store, currentT, retain, opts = {}) {
    const all = await listRoots(bucket);
    const keep = new Set(retain(all));
    keep.add(currentT);
    const marked = new Set();
    for (const t of keep) {
        const rec = await readRootAt(bucket, t);
        if (!rec)
            continue;
        const roots = recordToRoots(rec);
        for (const r of [roots.eavt, roots.aevt, roots.avet, roots.vaet])
            await reachable(store, r, marked);
    }
    let deleted = 0, scanned = 0;
    for (const prefix of ["seg/", "n/"]) {
        let cursor;
        do {
            const page = await bucket.list({ prefix, ...(cursor !== undefined && { cursor }), limit: 1000 });
            const doomed = [];
            for (const o of page.objects) {
                scanned++;
                const hash = o.key.slice(prefix.length);
                if (!marked.has(hash))
                    doomed.push(o.key);
            }
            if (doomed.length && !opts.dryRun)
                await bucket.delete(doomed);
            deleted += doomed.length;
            cursor = page.truncated ? page.cursor : undefined;
        } while (cursor);
    }
    if (opts.deleteRoots && !opts.dryRun) {
        const doomed = all.filter((t) => !keep.has(t)).map(rootKey);
        if (doomed.length)
            await bucket.delete(doomed);
    }
    return { retainedRoots: [...keep].sort((a, b) => a - b), reachable: marked.size, deleted, scanned };
}
export function retainNewest(n) {
    return (ts) => ts.slice(-n);
}
//# sourceMappingURL=index.js.map