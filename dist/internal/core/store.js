/**
 * Node stores. `MemStore` is the pure in-memory, content-addressed store used
 * by tests, benches and the in-memory `Connection`. It performs the same
 * encode → compress → sha256 pipeline the R2 store uses, so hashes are
 * identical across backends and structural-sharing tests can count objects.
 *
 * `Codec` abstracts compression (gzip via CompressionStream by default;
 * `identity` for speed in tests). Open decision §8: gzip vs zstd — gzip is
 * built in everywhere; zstd can be slotted in as another Codec later.
 */
import { gunzip, gzip, sha256Hex } from "./bytes.js";
import { decodeNode, encodeNode } from "./tree.js";
export const identityCodec = {
    name: "identity",
    compress: async (d) => d,
    decompress: async (d) => d,
};
export const gzipCodec = {
    name: "gzip",
    compress: gzip,
    decompress: gunzip,
};
/** Object key prefix per node kind (R2 layout: seg/<hash>, n/<hash>). */
export function objectKey(kind, hash) {
    return (kind === 0 ? "seg/" : "n/") + hash;
}
function countOf(node) {
    if (node.kind === 0)
        return node.datoms.length;
    let n = 0;
    for (const r of node.refs)
        n += r.count;
    return n;
}
/** Encode + compress + hash a node. Shared by every store implementation. */
export async function serializeNode(index, node, codec) {
    const raw = encodeNode(index, node);
    const body = await codec.compress(raw);
    const hash = await sha256Hex(body);
    return { ref: { hash, kind: node.kind, count: countOf(node) }, body };
}
export async function deserializeNode(body, codec) {
    const raw = await codec.decompress(body);
    return decodeNode(raw).node;
}
export class MemStore {
    codec;
    keepDecoded;
    nodes = new Map();
    bodies = new Map();
    stats = { puts: 0, objects: 0, loads: 0, bytes: 0 };
    constructor(codec = identityCodec, keepDecoded = true) {
        this.codec = codec;
        this.keepDecoded = keepDecoded;
    }
    peek(hash) {
        return this.nodes.get(hash);
    }
    async load(ref) {
        this.stats.loads++;
        const n = this.nodes.get(ref.hash);
        if (n)
            return n;
        const body = this.bodies.get(ref.hash);
        if (!body)
            throw new Error(`MemStore: missing node ${ref.hash}`);
        const node = await deserializeNode(body, this.codec);
        if (this.keepDecoded)
            this.nodes.set(ref.hash, node);
        return node;
    }
    async put(index, node) {
        this.stats.puts++;
        const { ref, body } = await serializeNode(index, node, this.codec);
        if (!this.bodies.has(ref.hash)) {
            this.bodies.set(ref.hash, body);
            this.stats.objects++;
            this.stats.bytes += body.length;
        }
        if (this.keepDecoded)
            this.nodes.set(ref.hash, node);
        return ref;
    }
    /** Forget decoded nodes (forces `load` on next access — for cold-path tests). */
    evictDecoded() {
        this.nodes.clear();
    }
    /** Delete every object not in `keep` (GC sweep). Returns number deleted. */
    sweep(keep) {
        let n = 0;
        for (const h of [...this.bodies.keys()]) {
            if (!keep.has(h)) {
                this.bodies.delete(h);
                this.nodes.delete(h);
                n++;
            }
        }
        this.stats.objects = this.bodies.size;
        return n;
    }
}
/**
 * A NodeSource that layers a memory cache in front of another source
 * (peer-side: mem → Cache API → R2). LRU by insertion order, bounded by node
 * count. `NodeStore` puts pass through to the backing store.
 */
export class CachingSource {
    backing;
    maxNodes;
    cache = new Map();
    hits = 0;
    misses = 0;
    constructor(backing, maxNodes = 4096) {
        this.backing = backing;
        this.maxNodes = maxNodes;
    }
    peek(hash) {
        const n = this.cache.get(hash);
        if (n !== undefined) {
            this.hits++;
            // refresh LRU position
            this.cache.delete(hash);
            this.cache.set(hash, n);
            return n;
        }
        const b = this.backing.peek(hash);
        if (b !== undefined)
            this.remember(hash, b);
        return b;
    }
    async load(ref) {
        const c = this.peek(ref.hash);
        if (c !== undefined)
            return c;
        this.misses++;
        const n = await this.backing.load(ref);
        this.remember(ref.hash, n);
        return n;
    }
    async put(index, node) {
        if (!("put" in this.backing))
            throw new Error("CachingSource: backing source is read-only");
        const ref = await this.backing.put(index, node);
        this.remember(ref.hash, node);
        return ref;
    }
    remember(hash, node) {
        this.cache.set(hash, node);
        if (this.cache.size > this.maxNodes) {
            const oldest = this.cache.keys().next().value;
            this.cache.delete(oldest);
        }
    }
}
//# sourceMappingURL=store.js.map