/**
 * Transaction log records and the (versioned) novelty wire format.
 *
 * - `LogEntry`: one committed transaction (t, txInstant, datoms).
 * - Binary chunk codec for `log/<t0>-<t1>` R2 objects (indexer input, replica catch-up).
 * - JSON wire format v1 for novelty frames pushed over WebSocket (Transactor → replicas
 *   → clients). Values are encoded so that every value type round-trips through JSON.
 */
import { type Datom } from "./datom.ts";
export interface LogEntry {
    t: number;
    txInstant: number;
    datoms: Datom[];
}
export declare function encodeLogChunk(entries: readonly LogEntry[]): Uint8Array;
export declare function decodeLogChunk(buf: Uint8Array): LogEntry[];
/** Compact JSON datom: [e, a, vt, v, t, op] with bytes base64-encoded. */
export type WireDatom = [number, number, number, string | number | boolean, number, 0 | 1];
export declare function toWireDatom(d: Datom): WireDatom;
export declare function fromWireDatom(w: WireDatom): Datom;
export interface NoveltyFrameV1 {
    v: 1;
    kind: "tx";
    t: number;
    txInstant: number;
    datoms: WireDatom[];
}
export interface RootFrameV1 {
    v: 1;
    kind: "root";
    /** new index root record */
    root: unknown;
}
export interface HelloFrameV1 {
    v: 1;
    kind: "hello";
    /** transactor's current basis t */
    t: number;
    /** current root record */
    root: unknown;
}
export interface GapFrameV1 {
    v: 1;
    kind: "gap";
    /** subscriber asked to resume from a t we no longer hold in the DO log; fetch log/ chunks up to `from` */
    from: number;
}
export type WireFrame = NoveltyFrameV1 | RootFrameV1 | HelloFrameV1 | GapFrameV1;
export declare function txFrame(entry: LogEntry): NoveltyFrameV1;
export declare function entryFromFrame(f: NoveltyFrameV1): LogEntry;
export declare function bytesToBase64(b: Uint8Array): string;
export declare function base64ToBytes(s: string): Uint8Array;
/** Root record as stored at root/current and roots/<t> (JSON). */
export interface RootRecord {
    v: 1;
    t: number;
    eavt: {
        hash: string;
        kind: 0 | 1;
        count: number;
    };
    aevt: {
        hash: string;
        kind: 0 | 1;
        count: number;
    };
    avet: {
        hash: string;
        kind: 0 | 1;
        count: number;
    };
    vaet: {
        hash: string;
        kind: 0 | 1;
        count: number;
    };
    /** highest t whose log chunk has been flushed to R2 */
    log_watermark: number;
    /** next entity id to allocate (so a restored transactor never reuses ids) */
    next_eid: number;
    codec: string;
    created_at: number;
}
//# sourceMappingURL=log.d.ts.map