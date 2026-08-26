/**
 * Segment (leaf) codec.
 *
 * A segment is a run of datoms sorted in one index's order. On disk it is:
 *
 *   magic "RSG1" | u8 index | u32 count | columns…
 *   columns: e (zigzag deltas) | a (uvar) | vt (u8) + v payload | t (zigzag deltas) | op (bit-packed)
 *
 * The bytes returned by `encodeSegment` are *uncompressed*; storage layers
 * apply gzip (see `bytes.ts#gzip`) or another codec — see `compress.ts`. The
 * content hash that names a segment (`seg/<sha256>`) is computed over the
 * compressed object body, so identical segments always dedupe.
 *
 * Target size ~3k datoms per leaf (see `tree.ts` builder options).
 */
import { ByteReader, ByteWriter } from "./bytes.ts";
import { type Datom, type DatomValue, type IndexId, ValueTag } from "./datom.ts";
export declare function writeValue(w: ByteWriter, vt: ValueTag, v: DatomValue): void;
export declare function readValue(r: ByteReader): {
    vt: ValueTag;
    v: DatomValue;
};
/** Row-encode one datom (used for directory keys). */
export declare function writeDatom(w: ByteWriter, d: Datom): void;
export declare function readDatom(r: ByteReader): Datom;
export declare function encodeSegment(index: IndexId, datoms: readonly Datom[]): Uint8Array;
export interface DecodedSegment {
    index: IndexId;
    datoms: Datom[];
}
export declare function decodeSegment(buf: Uint8Array): DecodedSegment;
//# sourceMappingURL=segment.d.ts.map