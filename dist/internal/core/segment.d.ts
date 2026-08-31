import { ByteReader, ByteWriter } from "./bytes.ts";
import { type Datom, type DatomValue, type IndexId, ValueTag } from "./datom.ts";
export declare function writeValue(w: ByteWriter, vt: ValueTag, v: DatomValue): void;
export declare function readValue(r: ByteReader): {
    vt: ValueTag;
    v: DatomValue;
};
export declare function writeDatom(w: ByteWriter, d: Datom): void;
export declare function readDatom(r: ByteReader): Datom;
export declare function encodeSegment(index: IndexId, datoms: readonly Datom[]): Uint8Array;
export interface DecodedSegment {
    index: IndexId;
    datoms: Datom[];
}
export declare function decodeSegment(buf: Uint8Array): DecodedSegment;
//# sourceMappingURL=segment.d.ts.map