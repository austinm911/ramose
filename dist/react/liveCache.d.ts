/**
 * Refcounted live-query cache for `useLiveQuery(db, q)`.
 *
 * Two hook sites with the same `(viewKey, astKey)` share one
 * raw `liveRaw` handle. The cache entry holds the un-finalized wire result;
 * each retain wrapper applies that subscriber's `finalize` (take-unwrap /
 * page-wrap / reshape) on read. The last `close()` tears the handle down.
 * The subscription form (`useLiveQuery(sub)`) does not go through this — the
 * caller owns that handle.
 *
 * A terminal error evicts the cache entry so a later `retry()` (or a
 * remount) opens a fresh standing read. Siblings still holding the dead
 * handle keep it until they close or retry. A per-subscriber `NotOne`
 * (oneOrFail) is not that: it is applied in the wrapper and does not
 * evict or poison siblings.
 */
import type { Subscription } from "../db/index.ts";
/**
 * Hold a shared subscription for `key`. `create` runs only on the first
 * retain; each caller gets a wrapper whose `close()` drops one ref and is
 * idempotent — a second close does not decrement again.
 *
 * `finalize` maps the shared raw wire result onto this subscriber's
 * terminal (`one()` unwrap, `oneOrFail()` NotOne, page wrap, reshape).
 * Row identity (`shareEqualDeep`) is per wrapper so a sibling's take-mode
 * cannot rewrite this hook's previous emission.
 */
export declare const retainLive: (key: string, create: () => Subscription<unknown, unknown>, finalize?: (result: unknown) => unknown) => Subscription<unknown, unknown>;
//# sourceMappingURL=liveCache.d.ts.map