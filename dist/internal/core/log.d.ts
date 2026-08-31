import { type Datom } from "./datom.ts";
export interface LogEntry {
    t: number;
    txInstant: number;
    datoms: Datom[];
}
export declare function encodeLogChunk(entries: readonly LogEntry[]): Uint8Array;
export declare function decodeLogChunk(buf: Uint8Array): LogEntry[];
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
    root: unknown;
}
export interface HelloFrameV1 {
    v: 1;
    kind: "hello";
    t: number;
    root: unknown;
}
export interface GapFrameV1 {
    v: 1;
    kind: "gap";
    from: number;
}
export type WireFrame = NoveltyFrameV1 | RootFrameV1 | HelloFrameV1 | GapFrameV1;
export declare function txFrame(entry: LogEntry): NoveltyFrameV1;
export declare function entryFromFrame(f: NoveltyFrameV1): LogEntry;
export declare function bytesToBase64(b: Uint8Array): string;
export declare function base64ToBytes(s: string): Uint8Array;
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
    log_watermark: number;
    next_eid: number;
    codec: string;
    created_at: number;
}
//# sourceMappingURL=log.d.ts.map