import { componentLogger, gzipCodec, txFrame } from "../core/index.js";
import { gcSweep, publishRoot, putLogChunk, retainNewest, rootsToRecord } from "../storage/index.js";
import { inertRuntimeBoundaries, } from "../runtime-boundaries.js";
export class Indexer {
    t;
    opts;
    boundaries;
    running = false;
    runs = 0;
    lastRun;
    lastGc;
    log = componentLogger("indexer");
    constructor(t, opts, boundaries = inertRuntimeBoundaries) {
        this.t = t;
        this.opts = opts;
        this.boundaries = boundaries;
    }
    get db() {
        try {
            return this.t.host.dbName;
        }
        catch {
            return undefined;
        }
    }
    status() {
        return { running: this.running, runs: this.runs, lastRun: this.lastRun, lastGc: this.lastGc, opts: this.opts };
    }
    async maybeSchedule() {
        if (this.t.txsSinceIndex >= this.opts.txThreshold) {
            await this.t.host.setAlarm(this.t.host.now());
        }
        else
            await this.schedule();
    }
    async schedule() {
        const existing = await this.t.host.getAlarm();
        if (existing === null)
            await this.t.host.setAlarm(this.t.host.now() + this.opts.intervalMs);
    }
    async onAlarm() {
        const res = await this.runOnce();
        if (res.remainingTxs > 0)
            await this.t.host.setAlarm(this.t.host.now() + 50);
    }
    async runNow() {
        return this.runOnce();
    }
    async runOnce() {
        const conn = this.t.connection;
        const fromT = conn.currentRoots.t;
        if (this.running)
            return { ran: false, fromT, toT: fromT, txs: 0, datoms: 0, ms: 0, r2Puts: 0, remainingTxs: conn.t - fromT };
        if (conn.t <= fromT)
            return { ran: false, fromT, toT: fromT, txs: 0, datoms: 0, ms: 0, r2Puts: 0, remainingTxs: 0 };
        this.running = true;
        const started = this.t.host.now();
        const putsBefore = this.t.nodeStore.stats.r2Puts;
        const noveltyBefore = conn.noveltyCount;
        try {
            await this.boundaries.checkpoint("indexer.run");
            const toT = Math.min(conn.t, fromT + this.opts.maxTxsPerRun);
            const entries = this.t.readLogEntries(fromT, toT);
            const datoms = entries.reduce((n, e) => n + e.datoms.length, 0);
            if (entries.length)
                await putLogChunk(this.t.bucket, entries, gzipCodec);
            const roots = await conn.index(toT);
            const rec = rootsToRecord(roots, {
                log_watermark: entries.length ? entries[entries.length - 1].t : this.t.watermark,
                next_eid: conn.nextEntityId,
                codec: gzipCodec.name,
            });
            await publishRoot(this.t.bucket, rec);
            this.t.adoptRoot(rec);
            this.t.pruneLog(toT - this.opts.logKeepTxs);
            this.runs++;
            const res = {
                ran: true,
                fromT,
                toT,
                txs: entries.length,
                datoms,
                ms: this.t.host.now() - started,
                r2Puts: this.t.nodeStore.stats.r2Puts - putsBefore,
                remainingTxs: conn.t - toT,
                root: rec,
            };
            this.lastRun = res;
            this.t.metrics.index({ db: this.db ?? "unknown", indexMs: res.ms, txs: res.txs, datoms: res.datoms, noveltyDatoms: noveltyBefore });
            this.log.info("index.run", { db: this.db, fromT, toT, txs: entries.length, datoms, ms: res.ms, r2Puts: res.r2Puts, remainingTxs: res.remainingTxs, noveltyAfter: conn.noveltyCount });
            if (this.opts.gcEveryN > 0 && this.runs % this.opts.gcEveryN === 0) {
                try {
                    this.lastGc = await this.gcNow();
                }
                catch (err) {
                    this.lastGc = { error: String(err) };
                    this.log.error("index.gc.error", { db: this.db, error: String(err) });
                }
            }
            return res;
        }
        catch (err) {
            this.log.error("index.error", { db: this.db, fromT, error: err instanceof Error ? err.message : String(err) });
            throw err;
        }
        finally {
            this.running = false;
        }
    }
    async gcNow() {
        const t0 = this.t.host.now();
        const res = await gcSweep(this.t.bucket, this.t.nodeStore, this.t.currentRootRecord.t, retainNewest(this.opts.retainRoots), { deleteRoots: true });
        this.lastGc = res;
        this.log.info("index.gc", { db: this.db, ...res, ms: this.t.host.now() - t0 });
        return res;
    }
}
export { txFrame };
//# sourceMappingURL=indexer.js.map