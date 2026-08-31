/**
 * `errorMessage` — the one-liner every toast wants.
 *
 * Framework-neutral: it inspects an error, not a component. Apps should not
 * restate it — reach for this instead of re-deriving a message per call site.
 */
/**
 * `message ?? _tag ?? String(error)`, tolerating fields that are not strings.
 *
 * The client's errors are all `Data.TaggedError` subclasses carrying both a
 * `message` and a `_tag`, so the first branch answers for them; the `_tag`
 * branch is the fallback for a tagged value thrown without a message, and
 * `String` catches everything a `throw` can carry that is not an object at all.
 */
export declare const errorMessage: (error: unknown) => string;
//# sourceMappingURL=errors.d.ts.map