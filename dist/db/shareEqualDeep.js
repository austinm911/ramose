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
const isPlainObject = (v) => {
    if (v === null || typeof v !== "object")
        return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
};
const bytesEqual = (a, b) => {
    if (a.byteLength !== b.byteLength)
        return false;
    for (let i = 0; i < a.byteLength; i++)
        if (a[i] !== b[i])
            return false;
    return true;
};
export const shareEqualDeep = (prev, next) => {
    if (Object.is(prev, next))
        return prev;
    if (prev instanceof Date && next instanceof Date) {
        return prev.getTime() === next.getTime() ? prev : next;
    }
    if (prev instanceof Uint8Array && next instanceof Uint8Array) {
        return bytesEqual(prev, next) ? prev : next;
    }
    if (Array.isArray(prev) && Array.isArray(next)) {
        const out = new Array(next.length);
        let equal = prev.length === next.length;
        for (let i = 0; i < next.length; i++) {
            const shared = shareEqualDeep(prev[i], next[i]);
            out[i] = shared;
            if (!Object.is(shared, prev[i]))
                equal = false;
        }
        return (equal ? prev : out);
    }
    if (isPlainObject(prev) && isPlainObject(next)) {
        const nextKeys = Object.keys(next);
        const out = {};
        let equal = Object.keys(prev).length === nextKeys.length;
        for (const key of nextKeys) {
            if (equal && !Object.prototype.hasOwnProperty.call(prev, key)) {
                equal = false;
            }
            const shared = shareEqualDeep(prev[key], next[key]);
            out[key] = shared;
            if (!Object.is(shared, prev[key]))
                equal = false;
        }
        return (equal ? prev : out);
    }
    return next;
};
//# sourceMappingURL=shareEqualDeep.js.map