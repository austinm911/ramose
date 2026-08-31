const SLOT_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const isAllocationSlotName = (value) => typeof value === "string" && SLOT_NAME.test(value);
const invalid = (detail) => {
    throw new Error(`ramose/schema: allocation slot ${detail}`);
};
const normalizePath = (slot, path) => {
    if (!Array.isArray(path)) {
        invalid(`${slot} must declare an output path array`);
    }
    const segments = path;
    return Object.freeze(segments.map((segment) => {
        if (typeof segment === "string") {
            if (segment.length === 0 || /[\u0000\s]/.test(segment)) {
                invalid(`${slot} has an empty or whitespace-bearing path segment`);
            }
            return segment;
        }
        if (typeof segment === "number" && Number.isSafeInteger(segment) &&
            segment >= 0) {
            return segment;
        }
        return invalid(`${slot} path segments must be property names or array indexes`);
    }));
};
export const allocationPathKey = (path) => JSON.stringify(path);
/**
 * Normalize and validate one declaration into the canonical ordered list a
 * queue record and an invocation digest may hold.
 *
 * Two slots may not name the same output position: the receipt maps a slot to
 * exactly one entity, so an aliased position would make the durable mapping
 * ambiguous in precisely the way this design exists to prevent.
 */
export const allocationSlots = (declaration = {}) => {
    const slots = [];
    const paths = new Map();
    for (const slot of Object.keys(declaration).sort()) {
        if (!SLOT_NAME.test(slot)) {
            invalid(`names must match ${SLOT_NAME.source}, not ${JSON.stringify(slot)}`);
        }
        const path = normalizePath(slot, declaration[slot]);
        const key = allocationPathKey(path);
        const owner = paths.get(key);
        if (owner !== undefined) {
            invalid(`${slot} and ${owner} both allocate the same output position`);
        }
        paths.set(key, slot);
        slots.push(Object.freeze({ slot, path }));
    }
    return Object.freeze(slots);
};
export const readAllocationPath = (output, path) => {
    let cursor = output;
    for (const segment of path) {
        if (typeof cursor !== "object" || cursor === null)
            return undefined;
        if (typeof segment === "number") {
            if (!Array.isArray(cursor) || !Object.hasOwn(cursor, segment))
                return undefined;
            cursor = cursor[segment];
        }
        else {
            if (Array.isArray(cursor) || !Object.hasOwn(cursor, segment))
                return undefined;
            cursor = cursor[segment];
        }
    }
    return cursor;
};
//# sourceMappingURL=allocations.js.map