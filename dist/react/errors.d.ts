/**
 * `errorMessage` — the one-liner every toast wants.
 *
 * All of Ramose's `DbError`s carry a human-readable `message` and a `_tag`
 * discriminator, so `e.message ?? e._tag ?? String(e)` covers the typed
 * failures, bare tagged errors, and anything else that leaks out of an
 * Effect. This is its one home; apps should not restate it.
 */
/** `e.message ?? e._tag ?? String(e)`, tolerating non-string fields. */
export declare const errorMessage: (error: unknown) => string;
//# sourceMappingURL=errors.d.ts.map