import { ALL_INDEXES, COMPARATORS, Index } from "./datom.js";
import { Db } from "./db.js";
import { Novelty } from "./novelty.js";
import { DB_IDENT, FIRST_USER_EID, Schema, bootstrapDatoms } from "./schema.js";
import { MemStore } from "./store.js";
import { buildTree, mergeTree } from "./tree.js";
import { expandTx } from "./tx.js";
export function sortForIndex(index, datoms) {
    const cmp = COMPARATORS[index];
    const arr = datoms.slice().sort(cmp);
    const out = [];
    for (let i = 0; i < arr.length; i++)
        if (i === 0 || cmp(arr[i - 1], arr[i]) !== 0)
            out.push(arr[i]);
    return out;
}
export async function emptyRoots(store, build) {
    const [eavt, aevt, avet, vaet] = await Promise.all(ALL_INDEXES.map((i) => buildTree(store, i, [], build)));
    return { t: 0, eavt, aevt, avet, vaet };
}
export async function buildRoots(store, schema, datoms, build) {
    let t = 0;
    for (const d of datoms)
        if (d.t > t)
            t = d.t;
    const avetDs = datoms.filter((d) => schema.isAvet(d.a));
    const vaetDs = datoms.filter((d) => schema.isVaet(d.a));
    const eavt = await buildTree(store, Index.EAVT, sortForIndex(Index.EAVT, datoms), build);
    const aevt = await buildTree(store, Index.AEVT, sortForIndex(Index.AEVT, datoms), build);
    const avet = await buildTree(store, Index.AVET, sortForIndex(Index.AVET, avetDs), build);
    const vaet = await buildTree(store, Index.VAET, sortForIndex(Index.VAET, vaetDs), build);
    return { t, eavt, aevt, avet, vaet };
}
export async function deriveSchema(store, roots) {
    const schema = Schema.bootstrap();
    const tmp = new Db({ store, roots, novelty: new Novelty(), basisT: roots.t, schema, nextEid: 0 });
    const identDatoms = await tmp.datomsArray(Index.AEVT, { a: DB_IDENT });
    const all = [];
    for (const e of new Set(identDatoms.map((d) => d.e)))
        all.push(...(await tmp.datomsArray(Index.EAVT, { e })));
    return schema.apply(all);
}
export async function mergeRoots(store, roots, novelty, maxT, build) {
    const pick = (i) => novelty.byIndex[i].all().filter((d) => d.t <= maxT);
    const eavt = await mergeTree(store, Index.EAVT, roots.eavt, pick(Index.EAVT), build);
    const aevt = await mergeTree(store, Index.AEVT, roots.aevt, pick(Index.AEVT), build);
    const avet = await mergeTree(store, Index.AVET, roots.avet, pick(Index.AVET), build);
    const vaet = await mergeTree(store, Index.VAET, roots.vaet, pick(Index.VAET), build);
    return { t: maxT, eavt, aevt, avet, vaet };
}
export class Connection {
    store;
    roots;
    novelty = new Novelty();
    schema = Schema.bootstrap();
    basisT = 0;
    nextEid = FIRST_USER_EID;
    build;
    now;
    composition;
    txQueue = Promise.resolve();
    rootHistory = [];
    constructor(opts) {
        this.store = opts.store ?? new MemStore();
        this.build = opts.build;
        this.now = opts.now ?? (() => Date.now());
        this.composition = opts.composition;
    }
    static async create(opts = {}) {
        const c = new Connection(opts);
        c.roots = await emptyRoots(c.store, c.build);
        c.rootHistory.push(c.roots);
        const boot = bootstrapDatoms();
        c.novelty.add(boot, (a) => c.schema.isAvet(a), (a) => c.schema.isVaet(a));
        c.basisT = 1;
        return c;
    }
    static async restore(store, roots, logDatoms, nextEid, opts = {}) {
        const c = new Connection({ ...opts, store });
        c.roots = roots;
        c.rootHistory.push(roots);
        c.schema = await deriveSchema(store, roots);
        c.basisT = roots.t;
        c.nextEid = nextEid;
        if (logDatoms.length)
            c.applyDatoms(logDatoms);
        return c;
    }
    static async fromDatoms(datoms, opts = {}) {
        const c = new Connection(opts);
        const schema = Schema.bootstrap().apply(datoms);
        c.schema = schema;
        const all = bootstrapDatoms().concat(datoms);
        c.roots = await buildRoots(c.store, schema, all, c.build);
        c.rootHistory.push(c.roots);
        c.basisT = c.roots.t;
        let maxE = FIRST_USER_EID - 1;
        for (const d of datoms)
            if (d.e < 2 ** 42 && d.e > maxE)
                maxE = d.e;
        c.nextEid = maxE + 1;
        return c;
    }
    db() {
        return new Db({
            store: this.store,
            roots: this.roots,
            novelty: this.novelty,
            basisT: this.basisT,
            schema: this.schema,
            nextEid: this.nextEid,
            composition: this.composition,
        });
    }
    get t() {
        return this.basisT;
    }
    get currentRoots() {
        return this.roots;
    }
    get noveltyCount() {
        return this.novelty.count;
    }
    get schemaView() {
        return this.schema;
    }
    get nextEntityId() {
        return this.nextEid;
    }
    bindComposition(composition) {
        if (this.composition !== undefined && this.composition !== composition) {
            throw new Error("connection already has deployed composition");
        }
        this.composition = composition;
    }
    applyDatoms(datoms) {
        if (datoms.length === 0)
            return;
        this.schema = this.schema.clone().apply(datoms);
        this.novelty.add(datoms, (a) => this.schema.isAvet(a), (a) => this.schema.isVaet(a));
        let maxT = this.basisT;
        let maxE = this.nextEid - 1;
        for (const d of datoms) {
            if (d.t > maxT)
                maxT = d.t;
            if (d.e < 2 ** 42 && d.e > maxE)
                maxE = d.e;
        }
        this.basisT = maxT;
        this.nextEid = maxE + 1;
    }
    transactValidated(txData, validate, txInstant, beforeApply = () => undefined) {
        const run = async () => {
            const dbBefore = this.db();
            const t = this.basisT + 1;
            const resolvedTxInstant = txInstant === undefined ? this.now() : txInstant;
            const res = await expandTx(dbBefore, txData, t, this.nextEid, resolvedTxInstant, this.composition === undefined ? undefined : { composition: this.composition });
            const schemaAfter = this.schema.clone().apply(res.datoms);
            const noveltyAfter = new Novelty();
            noveltyAfter.add(this.novelty.byIndex[Index.EAVT].all(), (a) => schemaAfter.isAvet(a), (a) => schemaAfter.isVaet(a));
            noveltyAfter.add(res.datoms, (a) => schemaAfter.isAvet(a), (a) => schemaAfter.isVaet(a));
            const dbAfter = new Db({
                store: this.store,
                roots: this.roots,
                novelty: noveltyAfter,
                basisT: t,
                schema: schemaAfter,
                nextEid: res.nextEid,
                composition: this.composition,
            });
            const report = {
                dbBefore,
                dbAfter,
                t,
                txEid: res.txEid,
                txData: res.datoms,
                txOps: res.ops,
                tempids: res.tempids,
            };
            const value = await validate(report);
            beforeApply();
            this.nextEid = res.nextEid;
            this.schema = schemaAfter;
            this.novelty.add(res.datoms, (a) => this.schema.isAvet(a), (a) => this.schema.isVaet(a));
            this.basisT = t;
            return { report: { ...report, dbAfter: this.db() }, value };
        };
        const p = this.txQueue.then(run, run);
        this.txQueue = p.catch(() => undefined);
        return p;
    }
    transact(txData) {
        return this.transactValidated(txData, () => undefined).then(({ report }) => report);
    }
    async index(upToT = this.basisT) {
        const maxT = Math.min(upToT, this.basisT);
        if (this.novelty.count === 0 || maxT <= this.roots.t)
            return this.roots;
        const roots = await mergeRoots(this.store, this.roots, this.novelty, maxT, this.build);
        const remaining = new Novelty();
        remaining.add(this.novelty.byIndex[Index.EAVT].all().filter((d) => d.t > maxT), (a) => this.schema.isAvet(a), (a) => this.schema.isVaet(a));
        this.novelty = remaining;
        this.roots = roots;
        this.rootHistory.push(roots);
        return roots;
    }
    dbAtRoot(roots) {
        return new Db({
            store: this.store,
            roots,
            novelty: new Novelty(),
            basisT: roots.t,
            schema: this.schema,
            nextEid: this.nextEid,
            composition: this.composition,
        });
    }
}
//# sourceMappingURL=conn.js.map