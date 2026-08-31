const UNKNOWN_COLO = "unknown";
export class TxMetrics {
    dataset;
    writes = 0;
    errors = 0;
    colo = UNKNOWN_COLO;
    constructor(dataset) {
        this.dataset = dataset;
    }
    get enabled() {
        return this.dataset !== undefined;
    }
    observeColo(colo) {
        if (colo && colo !== this.colo)
            this.colo = colo;
    }
    batch(p) {
        this.write("batch", p.db, [p.resolveMs, p.commitMs, p.batchSize, p.queueDepth, p.noveltyDatoms, p.txOk, p.txErr, p.fenceMs ?? 0]);
    }
    index(p) {
        this.write("index", p.db, [p.indexMs, 0, p.txs, 0, p.noveltyDatoms, p.datoms, 0]);
    }
    snapshot() {
        return { enabled: this.enabled, colo: this.colo, aeWrites: this.writes, aeErrors: this.errors };
    }
    write(stage, db, doubles) {
        const ds = this.dataset;
        if (!ds)
            return;
        try {
            ds.writeDataPoint({ indexes: [db], blobs: [stage, db, this.colo], doubles });
            this.writes++;
        }
        catch {
            this.errors++;
        }
    }
}
//# sourceMappingURL=observability.js.map