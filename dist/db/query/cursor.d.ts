/**
 * Schema-aware cursor codec — a `Cursor` is raw sort-key values, and a
 * `Date` that JSON-stringifies as an ISO string sorts as a string. Encode
 * through the query that minted the cursor so Instant / bytes / branded
 * keys come back as the values `:after` compares.
 */
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