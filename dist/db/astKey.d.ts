/**
 * Canonical structural keys for standing reads.
 *
 * The key is a deterministic serialization of the lowered query AST — the
 * same JSON that goes on the wire (`POST /db/:name/query`) — not a second
 * IR. Object keys are sorted so insertion order cannot fork the key.
 * Pull patterns use the same canonical JSON of `lowerPullPattern`, plus
 * a client-only `optional` marker — optionality is applied by
 * `reshapePullResult` and never reaches the wire.
 *
 * `queryAstKey` is memoized on the query object (hoisted queries lower
 * once; a render-fresh object lowers again). An impure generator body
 * (`Date.now()`, captured mutable state) is hidden by that memo: the key
 * freezes on first lower while `db.live` re-lowers every pass. Dev-mode
 * double-lowers at subscription setup ({@link assertLoweringPurity}) and
 * warns on mismatch; keep bodies pure. `pullPatternKey` memos the same
 * way so a hoisted shape lowers once.
 */
import { type AnyQueryObject } from "./query/index.ts";
/** Canonical JSON of a lowered query AST (or any JSON-shaped value). */
export declare const canonicalAstKey: (ast: unknown) => string;
/** Always compute a key — used by the purity guard. */
export declare const computeAstKey: (query: AnyQueryObject) => string;
/**
 * Structural identity of a query: the lowered AST. Memoized on the query
 * object — hoisted queries lower once; a render-fresh object lowers again
 * (small ASTs).
 */
export declare const queryAstKey: (query: AnyQueryObject) => string;
/**
 * Same as {@link queryAstKey}. Kept so resetKeys / the churn warning keep
 * a stable name for "the query half of the subscription identity".
 */
export declare const queryStructureKey: (query: AnyQueryObject) => string;
/** Always compute a pull-pattern key — used when the object is new. */
export declare const computePullPatternKey: (pattern: unknown) => string;
/**
 * Structural identity of a pull pattern: the lowered peer shape plus
 * client-only `.optional` markers. Memoized on the pattern object —
 * hoisted shapes lower once; a render-fresh `{ title: Todo.title }`
 * lowers again (small).
 */
export declare const pullPatternKey: (pattern: unknown) => string;
/**
 * Full live-subscription identity: `(viewKey, astKey)`.
 * `viewKey` is {@link DbSeam.key}.
 */
export declare const liveSubscriptionKey: (viewKey: string, query: AnyQueryObject) => string;
/**
 * Dev-mode: lower twice at subscription setup. The WeakMap memo hides an
 * impure body from the key (and from the churn warning); a mismatch here
 * is that footgun.
 */
export declare const assertLoweringPurity: (query: AnyQueryObject) => void;
//# sourceMappingURL=astKey.d.ts.map