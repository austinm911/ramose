import { type AnyQueryObject, type Cursor } from "./query.ts";
/**
 * Pack a page cursor for a URL. The string is opaque; only
 * {@link decodeCursor} against the same query rehydrates Instant / bytes.
 */
export declare const encodeCursor: (q: AnyQueryObject, cursor: Cursor) => string;
/**
 * Rehydrate a string {@link encodeCursor} produced. Instant keys come back
 * as `Date`; a JSON-stringified ISO instant is re-typed from the query's
 * sort keys, not left as a string.
 */
export declare const decodeCursor: (q: AnyQueryObject, encoded: string) => Cursor;
//# sourceMappingURL=cursor.d.ts.map