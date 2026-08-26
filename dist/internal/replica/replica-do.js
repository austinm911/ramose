/**
 * QueryReplica Durable Object (M5) — N per database, sharded by region/tenant.
 *
 * - Holds a WebSocket to the Transactor (resume-from-watermark on reconnect,
 *   gap detection via `t` continuity, catch-up from the transactor's /log or
 *   from R2 `log/` chunks).
 * - Keeps novelty since the current root sorted in memory and spilled to
 *   SQLite (survives eviction/restart without a full resync).
 * - Caches hot segments in SQLite (`segcache`) in front of R2.
 * - Serves `GET /basis` → { t, root, novelty } to Workers, and executes
 *   reads itself (`POST /query`: datalog / pull / entity) — the Worker's
 *   read path forwards here instead of running datalog in the Worker.
 * - Drops novelty ≤ new root on root flip.
 *
 * Workers never talk to the Transactor for reads (invariant §1.5).
 */
import { DurableObject } from "cloudflare:workers";
import { DEFAULT_QUERY_MAX_CELLS, anonymousPrincipal, componentLogger, decodeLogChunk, encodeLogChunk, entryFromFrame, fromJson, fromWireDatom, gzipCodec, query as runQuery, pull as runPull, toJson, toWireDatom, } from "../core/index.js";
import { R2NodeStore, dbPrefix, prefixedBucket, readCurrentRoot, readLogSince } from "../storage/index.js";
import { envInt, internalGate, internalHeaders } from "../transactor/index.js";
import * as Effect from "effect/Effect";
import { allowsRawTransact, authState, describePrincipal, principalForToken, rememberProvisioned, shouldProvision, viewDb, withEid } from "../../worker/auth.js";
import { openSession, parsePrincipalHeader, PRINCIPAL_HEADER, WRITES_HEADER } from "../../worker/session.js";
import { parseWritesHeader, resolveWrites } from "../../writes.js";
import { currentViewDatoms, decideSessionTx } from "../../worker/session-sync.js";
import { dbFromBasis, makeBasis } from "./basis.js";
import { replicaErrorResponse, toReplicaError } from "./errors.js";
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(toJson(body)), { status, headers: { "content-type": "application/json", ...extra } });
/** SQLite-backed byte tier for segment bodies (bounded by row count, LRU-ish by insertion). */
class SqliteTier {
    sql;
    maxRows;
    constructor(sql, maxRows = 2000) {
        this.sql = sql;
        this.maxRows = maxRows;
        sql.exec(`CREATE TABLE IF NOT EXISTS segcache (k TEXT PRIMARY KEY, body BLOB NOT NULL, ts INTEGER NOT NULL)`);
    }
    get(key) {
        const row = this.sql.exec(`SELECT body FROM segcache WHERE k = ?`, key).toArray()[0];
        return row ? new Uint8Array(row.body) : undefined;
    }
    put(key, body) {
        this.sql.exec(`INSERT OR REPLACE INTO segcache (k, body, ts) VALUES (?, ?, ?)`, key, body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength), Date.now());
        const n = this.sql.exec(`SELECT COUNT(*) AS n FROM segcache`).toArray()[0].n;
        if (n > this.maxRows) {
            this.sql.exec(`DELETE FROM segcache WHERE k IN (SELECT k FROM segcache ORDER BY ts ASC LIMIT ?)`, Math.ceil(this.maxRows / 10));
        }
    }
}
export class QueryReplicaDO extends DurableObject {
    sql;
    ready;
    store;
    dbName;
    root;
    entries = []; // novelty since root, ascending t
    ws;
    connecting;
    syncing;
    stats = { frames: 0, gaps: 0, reconnects: 0, rootFlips: 0, basisServed: 0, queries: 0, budgetAborts: 0 };
    log = componentLogger("replica");
    /** Live session protocol objects (rebuilt from hibernation attachments). */
    live = new Map();
    constructor(ctx, env) {
        super(ctx, env);
        this.sql = ctx.storage.sql;
    }
    // ---------------------------------------------------------------------------
    // Boot / persistence
    // ---------------------------------------------------------------------------
    init() {
        if (!this.ready)
            this.ready = this.boot();
        return this.ready;
    }
    async boot() {
        this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
        this.sql.exec(`CREATE TABLE IF NOT EXISTS novelty (t INTEGER PRIMARY KEY, tx_instant INTEGER NOT NULL, datoms BLOB NOT NULL)`);
        this.dbName = this.getMeta("db");
        if (this.dbName)
            this.bindStore(this.dbName);
        this.root = this.getMeta("root");
        if (this.root) {
            const rows = this.sql.exec(`SELECT t, tx_instant, datoms FROM novelty WHERE t > ? ORDER BY t`, this.root.t).toArray();
            this.entries = rows.map((r) => decodeLogChunk(new Uint8Array(r.datoms))[0]);
        }
    }
    /** Per-database view of the bucket (all keys under db/<name>/). */
    bucket;
    bindStore(db) {
        this.bucket = prefixedBucket(this.env.STORE, dbPrefix(db));
        this.store = new R2NodeStore(this.bucket, { codec: gzipCodec, maxNodes: 4096, tier: new SqliteTier(this.sql) });
    }
    getMeta(k) {
        const row = this.sql.exec(`SELECT v FROM meta WHERE k = ?`, k).toArray()[0];
        return row ? JSON.parse(row.v) : undefined;
    }
    setMeta(k, v) {
        this.sql.exec(`INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)`, k, JSON.stringify(v));
    }
    get basisT() {
        return this.entries.length ? this.entries[this.entries.length - 1].t : (this.root?.t ?? 0);
    }
    // ---------------------------------------------------------------------------
    // Novelty protocol
    // ---------------------------------------------------------------------------
    appendEntry(e) {
        this.entries.push(e);
        const body = encodeLogChunk([e]);
        this.sql.exec(`INSERT OR REPLACE INTO novelty (t, tx_instant, datoms) VALUES (?, ?, ?)`, e.t, e.txInstant, body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength));
    }
    /**
     * Apply one dense log frame, then walk every attached session. The follow
     * cursor is `basisT` after this returns — it does not move on a poll.
     */
    async applyDatoms(e) {
        this.appendEntry(e);
        await this.notifySessions(e);
    }
    adoptRoot(rec) {
        if (this.root && rec.t <= this.root.t)
            return;
        this.root = rec;
        this.setMeta("root", rec);
        // drop novelty absorbed by the new root
        const before = this.entries.length;
        this.entries = this.entries.filter((e) => e.t > rec.t);
        this.sql.exec(`DELETE FROM novelty WHERE t <= ?`, rec.t);
        this.stats.rootFlips++;
        this.log.info("replica.root", { db: this.dbName, rootT: rec.t, noveltyBefore: before, noveltyAfter: this.entries.length });
    }
    async handleFrame(frame) {
        this.stats.frames++;
        switch (frame.kind) {
            case "hello": {
                const rec = frame.root;
                if (!this.root || rec.t > this.root.t)
                    this.adoptRoot(rec);
                if (frame.t > this.basisT + 0) {
                    // transactor is ahead; it will send catch-up frames (or a gap frame) right after hello
                }
                break;
            }
            case "root":
                this.adoptRoot(frame.root);
                break;
            case "gap":
                this.stats.gaps++;
                this.log.warn("replica.gap", { db: this.dbName, from: frame.from, basisT: this.basisT });
                await this.catchUpFromR2(frame.from);
                break;
            case "tx": {
                const e = entryFromFrame(frame);
                const expected = this.basisT + 1;
                if (e.t < expected)
                    return; // duplicate / already applied
                if (e.t > expected) {
                    // gap: fill from the transactor's log (or R2), then apply this frame
                    this.stats.gaps++;
                    this.log.warn("replica.gap", { db: this.dbName, expected, got: e.t });
                    await this.fillGap(this.basisT, e.t - 1);
                    if (e.t !== this.basisT + 1)
                        return; // still inconsistent; a resume will fix it
                }
                if (!this.root || e.t > this.root.t)
                    await this.applyDatoms(e);
                break;
            }
        }
    }
    /** Fetch (from, to] from the transactor's HTTP /log, falling back to R2 chunks. */
    async fillGap(from, to) {
        if (!this.dbName)
            return;
        const stub = this.env.TRANSACTOR.get(this.env.TRANSACTOR.idFromName(this.dbName));
        const res = await stub.fetch(`https://transactor/log?from=${from}&to=${to}&db=${encodeURIComponent(this.dbName)}`, { headers: internalHeaders(this.env) });
        if (res.ok) {
            const body = (await res.json());
            if (body.earliestLogT !== 0 && body.earliestLogT <= from + 1) {
                for (const f of body.entries) {
                    const e = entryFromFrame(f);
                    if (e.t === this.basisT + 1)
                        await this.applyDatoms(e);
                }
                return;
            }
        }
        await this.catchUpFromR2(from, to);
    }
    /** Read log/ chunks from R2 for t in (from, to] and apply in order. */
    async catchUpFromR2(from, to = Number.MAX_SAFE_INTEGER) {
        if (!this.root) {
            const rec = await readCurrentRoot(this.bucket);
            if (rec)
                this.adoptRoot(rec);
        }
        const entries = await readLogSince(this.bucket, Math.max(from, this.basisT), to, gzipCodec);
        for (const e of entries)
            if (e.t === this.basisT + 1)
                await this.applyDatoms(e);
    }
    /** Establish (or re-establish) the WS subscription to the Transactor. */
    async ensureConnected() {
        if (this.ws && (this.ws.readyState === 1 /* OPEN */ || this.ws.readyState === 0))
            return;
        if (this.connecting)
            return this.connecting;
        this.connecting = this.connectUpstream().finally(() => (this.connecting = undefined));
        return this.connecting;
    }
    async connectUpstream() {
        if (!this.dbName)
            throw new Error("replica has no db assigned");
        if (!this.root) {
            const rec = await readCurrentRoot(this.bucket);
            if (rec)
                this.adoptRoot(rec);
        }
        const stub = this.env.TRANSACTOR.get(this.env.TRANSACTOR.idFromName(this.dbName));
        const res = await stub.fetch(`https://transactor/subscribe?from=${this.basisT}&db=${encodeURIComponent(this.dbName)}`, { headers: { Upgrade: "websocket", ...internalHeaders(this.env) } });
        const ws = res.webSocket;
        if (!ws)
            throw new Error(`transactor did not upgrade (status ${res.status})`);
        ws.accept();
        this.ws = ws;
        this.stats.reconnects++;
        this.log.info("replica.connect", { db: this.dbName, from: this.basisT, reconnects: this.stats.reconnects, novelty: this.entries.length });
        let chain = Promise.resolve();
        ws.addEventListener("message", (ev) => {
            // frames are applied strictly in order
            chain = chain.then(async () => {
                try {
                    const frame = JSON.parse(String(ev.data));
                    await this.handleFrame(frame);
                }
                catch (err) {
                    console.error("replica: bad frame", err);
                }
            });
        });
        const drop = () => {
            if (this.ws === ws)
                this.ws = undefined;
        };
        ws.addEventListener("close", drop);
        ws.addEventListener("error", drop);
        // give the hello + catch-up a moment so the first basis is fresh
        await new Promise((r) => setTimeout(r, 20));
        await chain;
    }
    /** Make sure we are connected and caught up (bounded wait). */
    async sync() {
        if (this.syncing)
            return this.syncing;
        this.syncing = (async () => {
            try {
                await this.ensureConnected();
            }
            catch (err) {
                // transactor unreachable: serve from R2 (root + log chunks) — stale but consistent
                this.log.warn("replica.connect.failed", { db: this.dbName, error: String(err), basisT: this.basisT });
                await this.catchUpFromR2(this.basisT).catch(() => undefined);
            }
        })().finally(() => (this.syncing = undefined));
        return this.syncing;
    }
    // ---------------------------------------------------------------------------
    // Session follow (apply-then-push)
    // ---------------------------------------------------------------------------
    sessionLog() {
        return {
            t: this.basisT,
            rootT: this.root?.t ?? 0,
            entries: this.entries.map((e) => ({ t: e.t, datoms: e.datoms.map(toWireDatom) })),
        };
    }
    async sieve(entry, p) {
        if (!this.root || !this.dbName)
            return { kind: "skip" };
        const basis = makeBasis(this.dbName, this.root, this.entries);
        const raw = await dbFromBasis(this.store, basis);
        const after = raw.asOf(entry.t);
        const before = raw.asOf(Math.max(0, entry.t - 1));
        const st = authState(this.env);
        let who = p;
        if (st.policy && who)
            who = await withEid(st.policy, who, after);
        return decideSessionTx({
            datoms: entry.datoms.map(fromWireDatom),
            policy: st.policy,
            principal: who,
            ruleDbAfter: after,
            ruleDbBefore: before,
        });
    }
    async snapshotView(p) {
        if (!this.root || !this.dbName)
            return { t: 0, datoms: [] };
        const basis = makeBasis(this.dbName, this.root, this.entries);
        const who = p ?? anonymousPrincipal(this.dbName);
        const dbv = await viewDb(this.env, who, this.store, basis);
        return { t: basis.t, datoms: await currentViewDatoms(dbv) };
    }
    /** Upsert the caller's row on the writer and attach the eid. */
    async provisionPrincipal(p) {
        if (!shouldProvision(p) || this.dbName === undefined)
            return p;
        const dbName = this.dbName;
        try {
            const stub = this.env.TRANSACTOR.get(this.env.TRANSACTOR.idFromName(dbName));
            const res = await stub.fetch(`https://transactor/provision?db=${encodeURIComponent(dbName)}`, {
                method: "POST",
                headers: { "content-type": "application/json", ...internalHeaders(this.env) },
                body: JSON.stringify({ principal: p }),
            });
            if (!res.ok)
                return p;
            const body = (await res.json());
            if (typeof body.eid !== "number")
                return p;
            return rememberProvisioned(p, body.eid);
        }
        catch {
            return p;
        }
    }
    createSession(ws, seed) {
        const dbName = this.dbName;
        return openSession(ws, {
            listen: false,
            seed,
            principal: seed.principal,
            dispatch: (rest, init, p) => this.sessionDispatch(rest, init, p, seed.writes),
            authenticate: (token) => principalForToken(this.env, token.length === 0 ? undefined : token, dbName),
            provision: (p) => this.provisionPrincipal(p),
            describe: async (p) => {
                if (p.eid !== undefined)
                    return { eid: p.eid, class: p.class };
                await this.sync();
                if (!this.root)
                    return { eid: null, class: p.class };
                return describePrincipal(this.env, p, this.store, makeBasis(dbName, this.root, this.entries));
            },
            readLog: async () => {
                await this.sync();
                return this.sessionLog();
            },
            filterEntry: (entry, p) => this.sieve(entry, p),
            snapshot: (p) => this.snapshotView(p),
        });
    }
    sessionOf(ws) {
        const hit = this.live.get(ws);
        if (hit)
            return hit;
        const raw = typeof ws.deserializeAttachment === "function" ? ws.deserializeAttachment() : undefined;
        const seed = (raw ?? { lastT: 0, watermark: 0 });
        const s = this.createSession(ws, seed);
        this.live.set(ws, s);
        return s;
    }
    persist(ws, s) {
        try {
            ws.serializeAttachment?.(s.state());
        }
        catch {
            /* attachment is optional outside workerd */
        }
    }
    async notifySessions(e) {
        const entry = { t: e.t, datoms: e.datoms.map(toWireDatom) };
        const rootT = this.root?.t ?? 0;
        const sockets = this.ctx.getWebSockets();
        for (const ws of sockets) {
            const s = this.sessionOf(ws);
            try {
                await s.applyEntry(entry, rootT);
                this.persist(ws, s);
            }
            catch {
                this.live.delete(ws);
                try {
                    ws.close(1011, "session filter failed");
                }
                catch {
                    /* already gone */
                }
            }
        }
    }
    async sessionDispatch(rest, init, principal, writes) {
        await this.sync();
        const dbName = this.dbName;
        if (!this.root)
            return json({ error: "database has no root yet" }, 503);
        if (rest === "/op" && init.method === "POST") {
            return json({ error: "operations must be POSTed to /db/:name/op" }, 400);
        }
        if (rest === "/transact" && init.method === "POST") {
            let tx = [];
            let clientTxId;
            if (init.body) {
                const raw = JSON.parse(init.body);
                tx = raw.tx;
                if (typeof raw.clientTxId === "string" && raw.clientTxId.length > 0)
                    clientTxId = raw.clientTxId;
            }
            const mode = writes ?? resolveWrites(undefined, this.env.RAMOSE_WRITES);
            if (!allowsRawTransact(mode, principal, tx, authState(this.env).policy)) {
                return json({ error: "raw transact is disabled; use operations", code: "operations" }, 403);
            }
            const stub = this.env.TRANSACTOR.get(this.env.TRANSACTOR.idFromName(dbName));
            return stub.fetch(`https://transactor/transact?db=${encodeURIComponent(dbName)}`, {
                method: "POST",
                headers: { "content-type": "application/json", ...internalHeaders(this.env) },
                body: JSON.stringify({ tx, principal, ...(clientTxId !== undefined ? { clientTxId } : {}) }),
            });
        }
        const basis = makeBasis(dbName, this.root, this.entries);
        const who = principal ?? anonymousPrincipal(dbName);
        const hdrs = { "x-ramose-basis-t": String(basis.t) };
        if (rest === "/info" && init.method === "GET") {
            const described = await describePrincipal(this.env, who, this.store, basis);
            return json({ db: dbName, t: basis.t, principal: described }, 200, hdrs);
        }
        if (rest === "/query" && init.method === "POST") {
            const body = fromJson(init.body ? JSON.parse(init.body) : {});
            if (!body?.query)
                return json({ error: "body must be { query, inputs? }" }, 400);
            const dbv = await viewDb(this.env, who, this.store, basis, { asOf: typeof body.asOf === "number" ? body.asOf : undefined, history: !!body.history });
            const stats = { clauses: [] };
            const result = await runQuery(dbv, body.query, body.inputs ?? [], { stats, maxCells: envInt(this.env.RAMOSE_QUERY_MAX_CELLS, DEFAULT_QUERY_MAX_CELLS) });
            return json({ t: basis.t, root: basis.root.t, result, ...(body.explain ? { explain: stats.clauses, budget: stats.budget } : {}) }, 200, hdrs);
        }
        if (rest === "/pull" && init.method === "POST") {
            const body = fromJson(init.body ? JSON.parse(init.body) : {});
            const dbv = await viewDb(this.env, who, this.store, basis, { asOf: typeof body.asOf === "number" ? body.asOf : undefined, history: !!body.history });
            if (body.eid === undefined || body.pattern === undefined)
                return json({ error: "body must be { eid, pattern }" }, 400);
            const eid = typeof body.eid === "number" ? body.eid : await dbv.entid(body.eid);
            if (eid === undefined)
                return json({ t: basis.t, result: null }, 200, hdrs);
            return json({ t: basis.t, result: await runPull(dbv, eid, body.pattern) }, 200, hdrs);
        }
        const em = /^\/entity\/(\d+)$/.exec(rest.split("?")[0] ?? "");
        if (em && init.method === "GET") {
            const asOfRaw = new URL(`https://replica${rest}`).searchParams.get("asOf");
            const asOf = asOfRaw !== null ? Number(asOfRaw) : undefined;
            const dbv = await viewDb(this.env, who, this.store, basis, { asOf: Number.isFinite(asOf) ? asOf : undefined });
            return json({ t: basis.t, entity: await dbv.entity(Number(em[1])) }, 200, hdrs);
        }
        return json({ error: "not found" }, 404);
    }
    async upgradeSession(request) {
        if ((request.headers.get("Upgrade") ?? "").toLowerCase() !== "websocket") {
            return json({ error: "expected websocket" }, 426);
        }
        await this.sync();
        const pair = new WebSocketPair();
        const [client, server] = [pair[0], pair[1]];
        this.ctx.acceptWebSocket(server);
        const raw = parsePrincipalHeader(request.headers.get(PRINCIPAL_HEADER));
        const principal = raw !== undefined ? await this.provisionPrincipal(raw) : undefined;
        const writes = parseWritesHeader(request.headers.get(WRITES_HEADER));
        const seed = {
            ...(principal !== undefined ? { principal } : {}),
            ...(writes !== undefined ? { writes } : {}),
            lastT: 0,
            watermark: 0,
        };
        const session = this.createSession(server, seed);
        this.live.set(server, session);
        this.persist(server, session);
        return new Response(null, { status: 101, webSocket: client });
    }
    async webSocketMessage(ws, message) {
        await this.init();
        const s = this.sessionOf(ws);
        await s.onMessage(message);
        this.persist(ws, s);
    }
    async webSocketClose(ws, code) {
        const s = this.live.get(ws);
        s?.close();
        this.live.delete(ws);
        try {
            ws.close(code, "bye");
        }
        catch {
            /* already gone */
        }
    }
    // ---------------------------------------------------------------------------
    // HTTP
    // ---------------------------------------------------------------------------
    async fetch(request) {
        // reachable only from the peer Worker
        const gate = internalGate(this.env, request);
        if (gate)
            return gate;
        await this.init();
        const url = new URL(request.url);
        const dbParam = url.searchParams.get("db");
        if (dbParam && dbParam !== this.dbName) {
            if (this.dbName !== undefined)
                return json({ error: `replica already bound to database ${this.dbName}` }, 409);
            this.dbName = dbParam;
            this.setMeta("db", dbParam);
            this.bindStore(dbParam);
        }
        if (!this.dbName)
            return json({ error: "missing ?db=" }, 400);
        if (url.pathname === "/session")
            return this.upgradeSession(request);
        // Route dispatch as an Effect program: the routes stay plain async/await,
        // failures are classified into tagged errors (errors.ts) and mapped back to
        // exactly the statuses/bodies this endpoint returned before.
        return Effect.runPromise(Effect.tryPromise({ try: () => this.route(request, url, this.dbName), catch: toReplicaError }).pipe(Effect.catchTags({
            QueryBudget: (e) => Effect.sync(() => {
                this.stats.budgetAborts++;
                this.log.warn("query.budget-exceeded", { db: this.dbName, clause: e.clause, cells: e.cells, limit: e.limit, spentBy: e.spentBy ?? "caller" });
                return replicaErrorResponse(e);
            }),
            BadRequest: (e) => Effect.sync(() => replicaErrorResponse(e)),
            Internal: (e) => Effect.sync(() => replicaErrorResponse(e)),
        })));
    }
    async route(request, url, dbName) {
        switch (url.pathname) {
            case "/basis": {
                await this.sync();
                if (!this.root)
                    return json({ error: "database has no root yet" }, 503);
                this.stats.basisServed++;
                if (this.stats.basisServed % 100 === 1)
                    this.log.debug("replica.basis", { db: this.dbName, t: this.basisT, rootT: this.root.t, novelty: this.entries.length, served: this.stats.basisServed });
                const basis = makeBasis(dbName, this.root, this.entries, this.ctx.id.toString().slice(0, 8));
                return json(basis);
            }
            case "/query": {
                // Executes the read on the replica (SPEC §8): plain datalog, pull, or a whole-entity read.
                // The Worker forwards its public /query /pull /entity bodies here; the JSON shape it returns
                // is exactly what the Worker used to build itself.
                await this.sync();
                if (!this.root)
                    return json({ error: "database has no root yet" }, 503);
                const body = fromJson(await request.json());
                if (!body || (!body.query && !body.pull && typeof body.entity !== "number"))
                    return json({ error: "body must be { query, inputs? } | { pull } | { entity }" }, 400);
                const basis = makeBasis(dbName, this.root, this.entries);
                const before = { ...this.store.stats };
                const db = await dbFromBasis(this.store, basis, { asOf: typeof body.asOf === "number" ? body.asOf : undefined, history: !!body.history });
                this.stats.queries++;
                const hdrs = () => ({
                    "x-ramose-basis-t": String(basis.t),
                    "x-ramose-r2-gets": String(this.store.stats.r2Gets - before.r2Gets),
                    "x-ramose-cache-hits": String(this.store.stats.cacheHits + this.store.stats.tierHits + this.store.stats.memHits - before.cacheHits - before.tierHits - before.memHits),
                });
                if (typeof body.entity === "number")
                    return json({ t: basis.t, entity: await db.entity(body.entity) }, 200, hdrs());
                if (body.pull) {
                    const eid = typeof body.pull.eid === "number" ? body.pull.eid : await db.entid(body.pull.eid);
                    if (eid === undefined)
                        return json({ t: basis.t, result: null }, 200, hdrs());
                    return json({ t: basis.t, result: await runPull(db, eid, body.pull.pattern) }, 200, hdrs());
                }
                const stats = { clauses: [] };
                const result = await runQuery(db, body.query, body.inputs ?? [], { stats, maxCells: envInt(this.env.RAMOSE_QUERY_MAX_CELLS, DEFAULT_QUERY_MAX_CELLS) });
                if (this.stats.queries % 100 === 1)
                    this.log.debug("replica.query", { db: this.dbName, t: basis.t, rows: Array.isArray(result) ? result.length : 1, novelty: this.entries.length, peakCells: stats.budget?.peakCells });
                return json({ t: basis.t, root: basis.root.t, result, ...(body.explain ? { explain: stats.clauses, budget: stats.budget } : {}) }, 200, hdrs());
            }
            case "/info":
                return json({ db: this.dbName, t: this.basisT, root: this.root, novelty: this.entries.length, connected: this.ws?.readyState === 1, stats: this.stats, store: this.store.stats });
            case "/admin/reconnect": {
                try {
                    this.ws?.close(1000, "reconnect");
                }
                catch { }
                this.ws = undefined;
                await this.sync();
                return json({ ok: true, t: this.basisT });
            }
            default:
                return json({ error: "not found" }, 404);
        }
    }
}
//# sourceMappingURL=replica-do.js.map