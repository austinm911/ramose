/**
 * JSON transport encoding for values that JSON cannot represent natively:
 *   Date        ⇄ { "$inst": <epoch ms> }
 *   Uint8Array  ⇄ { "$bytes": <base64> }
 *   uuid values ⇄ { "$uuid": "<canonical>" } on the wire; the public value is a string.
 *   Incoming `{ vt: 6, v }` tagged values still encode as `$uuid`.
 *   bigint      →  number
 * Used by the HTTP API (worker ⇄ client) and the DO RPC bodies.
 */
export declare function toJson(v: unknown): unknown;
export declare function fromJson(v: unknown): unknown;
export declare function stringifyJson(v: unknown): string;
export declare function parseJson<T = unknown>(s: string): T;
//# sourceMappingURL=json.d.ts.map