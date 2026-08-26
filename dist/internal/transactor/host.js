/**
 * The runtime seam of the Transactor.
 *
 * `Transactor` (transactor.ts) contains the whole write path — validation,
 * tempid/unique resolution, monotonic `t`, group commit, novelty broadcast,
 * root ownership — and touches the outside world only through this
 * interface. The Durable Object shell (transactor-do.ts) implements it over
 * `ctx.storage.sql` / WebSockets / alarms; the Bun test + bench harness
 * implements it over `bun:sqlite` and fake sockets, so the write pipeline is
 * exercised (with fault injection) without Cloudflare.
 */
export const DEFAULT_CONFIG = {
    indexTxThreshold: 500,
    indexIntervalMs: 5_000,
    indexMaxTxsPerRun: 5_000,
    logKeepTxs: 20_000,
    gcEveryNIndexes: 50,
    retainRoots: 20,
    maxBatch: 0,
    timingYields: false,
};
//# sourceMappingURL=host.js.map