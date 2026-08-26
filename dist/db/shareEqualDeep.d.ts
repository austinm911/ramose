/**
 * Structural sharing for standing-read emissions.
 *
 * Walk `next` against `prev` and reuse the previous node whenever the two
 * are deep-equal (TanStack Query's `replaceEqualDeep`). A single-row change
 * then keeps `Object.is` identity on every unchanged row, so
 * `key={row.id}` children bail out of re-render.
 *
 * This is the change detector too: if the shared root is `Object.is` the
 * previous emission, the tick was not news — no `JSON.stringify` of the
 * whole result.
 */
export declare const shareEqualDeep: <T>(prev: T, next: T) => T;
//# sourceMappingURL=shareEqualDeep.d.ts.map