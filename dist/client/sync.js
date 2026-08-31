const STATES = Object.freeze({
    idle: Object.freeze({ status: "idle" }),
    connecting: Object.freeze({ status: "connecting" }),
    live: Object.freeze({ status: "live" }),
    stale: Object.freeze({ status: "stale" }),
    offline: Object.freeze({ status: "offline" }),
    "update-required": Object.freeze({ status: "update-required" }),
    "authentication-required": Object.freeze({
        status: "authentication-required",
    }),
    closed: Object.freeze({ status: "closed" }),
});
export const syncState = (status) => STATES[status];
const SEVERITY = Object.freeze([
    "closed",
    "update-required",
    "authentication-required",
    "offline",
    "connecting",
    "stale",
    "live",
]);
export const aggregateSyncStatus = (statuses) => {
    let worst;
    for (const status of statuses) {
        const rank = SEVERITY.indexOf(status);
        if (rank === -1)
            continue;
        if (worst === undefined || rank < worst)
            worst = rank;
    }
    return worst === undefined ? "idle" : SEVERITY[worst];
};
//# sourceMappingURL=sync.js.map