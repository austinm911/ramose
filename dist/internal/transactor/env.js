export function envInt(v, dflt) {
    const n = v === undefined ? NaN : Number(v);
    return Number.isFinite(n) ? n : dflt;
}
//# sourceMappingURL=env.js.map