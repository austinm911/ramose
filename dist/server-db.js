/**
 * Server-side db handles — the same wire as the browser client, without
 * `live` / `livePull`.
 *
 * A Worker (or Action) reaching the peer has no session socket to give, so
 * those methods always defect. They are not on this type.
 */
const stripEffectRead = (effect) => {
    const { live: _l, livePull: _lp, asOf, history, ...rest } = effect;
    return {
        ...rest,
        asOf: (t) => stripEffectRead(asOf(t)),
        get history() {
            return stripEffectRead(history);
        },
    };
};
const stripRead = (db) => {
    const { live: _l, livePull: _lp, effect, asOf, history, ...rest } = db;
    return {
        ...rest,
        asOf: (t) => stripRead(asOf(t)),
        get history() {
            return stripRead(history);
        },
        effect: stripEffectRead(effect),
    };
};
const stripEffectDb = (effect) => {
    const { live: _l, livePull: _lp, asOf, history, ...rest } = effect;
    return {
        ...rest,
        asOf: (t) => stripEffectRead(asOf(t)),
        get history() {
            return stripEffectRead(history);
        },
    };
};
/** Drop `live` / `livePull` from a full client handle. */
export const withoutLive = (db) => {
    const { live: _l, livePull: _lp, effect, asOf, history, ...rest } = db;
    return {
        ...rest,
        asOf: (t) => stripRead(asOf(t)),
        get history() {
            return stripRead(history);
        },
        effect: stripEffectDb(effect),
    };
};
/** Type-level read-only view of a server handle. Writes still exist at runtime. */
export const asRead = (db) => db;
//# sourceMappingURL=server-db.js.map