import { DurableObject } from "cloudflare:workers";
import { componentLogger, decodeLogChunk, encodeLogChunk, entryFromFrame, gzipCodec, toJson, } from "../core/index.js";
import { R2NodeStore, dbPrefix, prefixedBucket, readCurrentRoot, readLogSince } from "../storage/index.js";
import { internalGate, internalHeaders } from "../transactor/index.js";
import * as Effect from "effect/Effect";
import { makeBasis } from "./basis.js";
import { replicaErrorResponse, toReplicaError } from "./errors.js";
import { decideReplicationRevisionRetention, } from "./revision-retention.js";
import { decideServerIdentityBinding, generateServerIdentityRoot, readServerIdentityRootRecord, SERVER_IDENTITY_INCOMPATIBLE, SERVER_IDENTITY_KEY_ID, SERVER_IDENTITY_UNREADABLE, } from "../replication/server-identity.js";
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(toJson(body)), { status, headers: { "content-type": "application/json", ...extra } });
const DEPLOYMENT_HEADER = "x-ramose-deployment";
const LIVE_DEPLOYMENT_INTERVAL_MS = 2_000;
const LIVE_DEPLOYMENT_TIMEOUT_MS = 2_000;
const LIVE_UPSTREAM_WATCH_INTERVAL_MS = 1_000;
const LIVE_UPSTREAM_STALE_MS = 3_500;
const LIVE_UPSTREAM_CATCHUP_TIMEOUT_MS = 2_000;
const OPAQUE_REPLICATION_ID = /^[A-Za-z0-9_-]{43}$/;
const withAbortTimeout = async (timeoutMs, run) => {
    const controller = new AbortController();
    let timeout;
    const deadline = new Promise((_, reject) => {
        timeout = setTimeout(() => {
            controller.abort();
            reject(new Error(`operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });
    try {
        return await Promise.race([run(controller.signal), deadline]);
    }
    finally {
        if (timeout !== undefined)
            clearTimeout(timeout);
    }
};
export function requestedMinT(raw) {
    if (raw === null || raw === undefined || raw === "")
        return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
}
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
export class QueryReplicaDOBase extends DurableObject {
    sql;
    ready;
    store;
    dbName;
    root;
    entries = [];
    ws;
    connecting;
    syncing;
    applyChain = Promise.resolve();
    reconnectTimer;
    reconnectDelayMs = 0;
    watchTimer;
    lastUpstreamAt = 0;
    stats = { frames: 0, gaps: 0, reconnects: 0, rootFlips: 0, basisServed: 0, queries: 0, budgetAborts: 0 };
    log = componentLogger("replica");
    constructor(ctx, env) {
        super(ctx, env);
        this.sql = ctx.storage.sql;
    }
    init() {
        if (!this.ready)
            this.ready = this.boot();
        return this.ready;
    }
    async boot() {
        this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
        this.sql.exec(`CREATE TABLE IF NOT EXISTS novelty (t INTEGER PRIMARY KEY, tx_instant INTEGER NOT NULL, datoms BLOB NOT NULL)`);
        this.sql.exec(`CREATE TABLE IF NOT EXISTS replication_revisions (
      revision TEXT NOT NULL,
      binding TEXT NOT NULL,
      basis_t INTEGER NOT NULL,
      touched INTEGER NOT NULL,
      PRIMARY KEY (binding, revision)
    )`);
        this.sql.exec(`CREATE INDEX IF NOT EXISTS replication_revisions_binding_age
      ON replication_revisions (binding, touched, revision)`);
        this.dbName = this.getMeta("db");
        if (this.dbName)
            this.bindStore(this.dbName);
        this.root = this.getMeta("root");
        if (this.root) {
            const rows = this.sql.exec(`SELECT t, tx_instant, datoms FROM novelty WHERE t > ? ORDER BY t`, this.root.t).toArray();
            this.entries = rows.map((r) => decodeLogChunk(new Uint8Array(r.datoms))[0]);
        }
    }
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
    appendEntry(e) {
        this.entries.push(e);
        const body = encodeLogChunk([e]);
        this.sql.exec(`INSERT OR REPLACE INTO novelty (t, tx_instant, datoms) VALUES (?, ?, ?)`, e.t, e.txInstant, body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength));
    }
    async beforeApplyDatoms(_entry) { }
    async notifyAppliedEntry(entry) {
        this.notifyBasisWatches(entry.t);
    }
    async applyDatoms(e) {
        await this.beforeApplyDatoms(e);
        this.appendEntry(e);
        await this.notifyAppliedEntry(e);
    }
    adoptRoot(rec) {
        if (this.root && rec.t <= this.root.t)
            return;
        const beforeT = this.basisT;
        this.root = rec;
        this.setMeta("root", rec);
        const before = this.entries.length;
        this.entries = this.entries.filter((e) => e.t > rec.t);
        this.sql.exec(`DELETE FROM novelty WHERE t <= ?`, rec.t);
        this.stats.rootFlips++;
        this.log.info("replica.root", { db: this.dbName, rootT: rec.t, noveltyBefore: before, noveltyAfter: this.entries.length });
        if (this.basisT !== beforeT)
            this.notifyBasisWatches(this.basisT);
    }
    async handleFrame(frame) {
        this.stats.frames++;
        switch (frame.kind) {
            case "hello": {
                const rec = frame.root;
                if (!this.root || rec.t > this.root.t)
                    this.adoptRoot(rec);
                if (frame.t > this.basisT + 0) {
                }
                break;
            }
            case "root":
                this.adoptRoot(frame.root);
                break;
            case "gap":
                this.stats.gaps++;
                this.log.warn("replica.gap", { db: this.dbName, from: frame.from, basisT: this.basisT });
                await withAbortTimeout(LIVE_UPSTREAM_CATCHUP_TIMEOUT_MS, async (signal) => {
                    await this.catchUpFromR2(frame.from);
                    if (signal.aborted)
                        throw new Error("upstream catch-up timed out");
                });
                break;
            case "tx": {
                const e = entryFromFrame(frame);
                const expected = this.basisT + 1;
                if (e.t < expected)
                    return;
                if (e.t > expected) {
                    this.stats.gaps++;
                    this.log.warn("replica.gap", { db: this.dbName, expected, got: e.t });
                    await withAbortTimeout(LIVE_UPSTREAM_CATCHUP_TIMEOUT_MS, (signal) => this.fillGap(this.basisT, e.t - 1, signal));
                    if (e.t !== this.basisT + 1)
                        return;
                }
                if (!this.root || e.t > this.root.t)
                    await this.applyDatoms(e);
                break;
            }
        }
    }
    async fillGap(from, to, signal) {
        if (!this.dbName)
            return;
        try {
            const stub = this.env.TRANSACTOR.get(this.env.TRANSACTOR.idFromName(this.dbName));
            const res = await stub.fetch(`https://transactor/log?from=${from}&to=${to}&db=${encodeURIComponent(this.dbName)}`, {
                headers: internalHeaders(this.env),
                ...(signal === undefined ? {} : { signal }),
            });
            if (res.ok) {
                const body = (await res.json());
                if (body.earliestLogT !== 0 && body.earliestLogT <= from + 1) {
                    for (const f of body.entries) {
                        if (signal?.aborted)
                            throw new Error("upstream catch-up timed out");
                        const e = entryFromFrame(f);
                        if (e.t === this.basisT + 1)
                            await this.applyDatoms(e);
                    }
                    return;
                }
            }
        }
        catch (err) {
            if (signal?.aborted)
                throw err;
            this.log.warn("replica.log.fetch.failed", { db: this.dbName, error: String(err), from, to });
        }
        if (signal?.aborted)
            throw new Error("upstream catch-up timed out");
        await this.catchUpFromR2(from, to);
        if (signal?.aborted)
            throw new Error("upstream catch-up timed out");
    }
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
    async ensureConnected() {
        if (this.ws && (this.ws.readyState === 1 || this.ws.readyState === 0))
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
        this.reconnectDelayMs = 0;
        this.lastUpstreamAt = Date.now();
        this.log.info("replica.connect", { db: this.dbName, from: this.basisT, reconnects: this.stats.reconnects, novelty: this.entries.length });
        ws.addEventListener("message", (ev) => this.enqueueFrame(ev));
        const drop = () => {
            if (this.ws !== ws)
                return;
            this.ws = undefined;
            this.closeBasisWatches("upstream disconnected");
            this.scheduleReconnect();
        };
        ws.addEventListener("close", drop);
        ws.addEventListener("error", drop);
        if (this.listening())
            this.armWatch();
        await new Promise((r) => setTimeout(r, 20));
        await this.drainFrames();
    }
    listening() {
        return this.ctx.getWebSockets().length > 0;
    }
    scheduleReconnect() {
        if (this.ws && (this.ws.readyState === 1 || this.ws.readyState === 0))
            return;
        if (this.connecting || this.reconnectTimer !== undefined)
            return;
        const delay = this.reconnectDelayMs;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            const run = this.ensureConnected()
                .then(() => {
                this.reconnectDelayMs = 0;
                if (this.listening())
                    this.armWatch();
            })
                .catch((err) => {
                this.log.warn("replica.reconnect.failed", { db: this.dbName, error: String(err), basisT: this.basisT, delayMs: this.reconnectDelayMs });
                this.reconnectDelayMs = this.reconnectDelayMs === 0 ? 250 : Math.min(8_000, this.reconnectDelayMs * 2);
                if (this.listening())
                    this.scheduleReconnect();
            });
            this.ctx.waitUntil?.(run);
        }, delay);
    }
    armWatch() {
        if (this.watchTimer !== undefined)
            return;
        this.watchTimer = setTimeout(() => {
            this.watchTimer = undefined;
            void this.tickWatch().finally(() => {
                if (this.listening())
                    this.armWatch();
            });
        }, LIVE_UPSTREAM_WATCH_INTERVAL_MS);
    }
    async tickWatch() {
        if (!this.listening())
            return;
        if (!this.ws || this.ws.readyState !== 1) {
            this.closeBasisWatches("upstream unavailable");
            this.scheduleReconnect();
            return;
        }
        if (this.lastUpstreamAt !== 0 && Date.now() - this.lastUpstreamAt > LIVE_UPSTREAM_STALE_MS) {
            this.log.warn("replica.upstream.stale", { db: this.dbName, basisT: this.basisT, silentMs: Date.now() - this.lastUpstreamAt });
            this.closeBasisWatches("upstream stale");
            try {
                this.ws.close(1000, "stale");
            }
            catch {
            }
            this.ws = undefined;
            this.scheduleReconnect();
            return;
        }
        try {
            this.ws.send(JSON.stringify({ kind: "ping" }));
        }
        catch {
            this.closeBasisWatches("upstream ping failed");
            this.ws = undefined;
            this.scheduleReconnect();
        }
    }
    enqueue(work) {
        const next = this.applyChain.then(work);
        this.applyChain = next.then(() => undefined, () => undefined);
        return next;
    }
    enqueueFrame(ev) {
        void this.onUpstreamData(String(ev.data));
    }
    async onUpstreamData(data) {
        let raw;
        try {
            raw = JSON.parse(data);
        }
        catch (err) {
            console.error("replica: bad frame", err);
            this.closeBasisWatches("invalid upstream frame");
            return;
        }
        this.lastUpstreamAt = Date.now();
        if (raw !== null && typeof raw === "object" && raw.kind === "pong") {
            const t = raw.t;
            if (typeof t === "number") {
                try {
                    await withAbortTimeout(LIVE_UPSTREAM_CATCHUP_TIMEOUT_MS, (signal) => this.catchUpTo(t, signal));
                }
                catch (err) {
                    this.log.warn("replica.watch.catchup.failed", { db: this.dbName, error: String(err), basisT: this.basisT, targetT: t });
                    this.closeBasisWatches("upstream catch-up failed");
                }
            }
            return;
        }
        await this.enqueue(async () => {
            try {
                await this.handleFrame(raw);
            }
            catch (err) {
                console.error("replica: bad frame", err);
                this.closeBasisWatches("upstream apply failed");
            }
        });
    }
    async drainFrames() {
        await this.applyChain;
    }
    async catchUpTo(minT, signal) {
        if (minT === undefined || this.basisT >= minT)
            return;
        const target = minT;
        await this.enqueue(async () => {
            if (signal?.aborted)
                throw new Error("upstream catch-up timed out");
            if (this.basisT >= target)
                return;
            await this.fillGap(this.basisT, target, signal);
        });
    }
    async sync() {
        if (this.syncing)
            return this.syncing;
        this.syncing = (async () => {
            try {
                await this.ensureConnected();
                await this.drainFrames();
            }
            catch (err) {
                this.log.warn("replica.connect.failed", { db: this.dbName, error: String(err), basisT: this.basisT });
                await this.catchUpFromR2(this.basisT).catch(() => undefined);
                if (this.listening())
                    this.scheduleReconnect();
            }
        })().finally(() => (this.syncing = undefined));
        return this.syncing;
    }
    basisWatchOf(ws) {
        try {
            const raw = ws.deserializeAttachment?.();
            if (raw?.kind === "basis-watch" &&
                typeof raw.expectedDeployment === "string" &&
                raw.expectedDeployment.length > 0 &&
                typeof raw.healthUrl === "string") {
                return raw;
            }
        }
        catch {
        }
        return undefined;
    }
    basisWatches() {
        const watches = [];
        for (const ws of this.ctx.getWebSockets()) {
            const attachment = this.basisWatchOf(ws);
            if (attachment !== undefined)
                watches.push([ws, attachment]);
        }
        return watches;
    }
    async armDeploymentWatch() {
        const next = Date.now() + LIVE_DEPLOYMENT_INTERVAL_MS;
        const armed = await this.ctx.storage.getAlarm();
        if (armed === null || armed > next)
            await this.ctx.storage.setAlarm(next);
    }
    notifyBasisWatches(t) {
        if (this.dbName === undefined || this.root === undefined) {
            this.closeBasisWatches("basis unavailable");
            return;
        }
        const basis = makeBasis(this.dbName, this.root, this.entries, this.ctx.id.toString().slice(0, 8));
        const body = JSON.stringify({ kind: "basis", t, basis });
        for (const [ws] of this.basisWatches()) {
            try {
                ws.send(body);
            }
            catch {
                try {
                    ws.close(1011, "basis notification failed");
                }
                catch {
                }
            }
        }
    }
    closeBasisWatches(reason) {
        for (const [ws] of this.basisWatches()) {
            try {
                ws.close(1011, reason);
            }
            catch {
            }
        }
    }
    async upgradeBasisWatch(request) {
        if ((request.headers.get("Upgrade") ?? "").toLowerCase() !== "websocket") {
            return json({ error: "expected websocket" }, 426);
        }
        const expectedDeployment = request.headers.get("x-ramose-live-deployment") ?? "";
        const healthUrl = request.headers.get("x-ramose-live-health") ?? "";
        let health;
        try {
            health = new URL(healthUrl);
        }
        catch {
            return json({ error: "invalid deployment watch" }, 400);
        }
        if (expectedDeployment.length === 0 ||
            (health.protocol !== "https:" && health.protocol !== "http:") ||
            health.pathname !== "/health" ||
            health.username !== "" ||
            health.password !== "") {
            return json({ error: "invalid deployment watch" }, 400);
        }
        await this.sync();
        if (this.ws?.readyState !== 1) {
            return json({ error: "replica upstream unavailable" }, 503);
        }
        if (this.dbName === undefined || this.root === undefined) {
            return json({ error: "database has no root yet" }, 503);
        }
        const pair = new WebSocketPair();
        const [client, server] = [pair[0], pair[1]];
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment?.({
            kind: "basis-watch",
            expectedDeployment,
            healthUrl: health.href,
        });
        const basis = makeBasis(this.dbName, this.root, this.entries, this.ctx.id.toString().slice(0, 8));
        server.send(JSON.stringify({ kind: "ready", t: basis.t, basis }));
        this.armWatch();
        await this.armDeploymentWatch();
        return new Response(null, { status: 101, webSocket: client });
    }
    async webSocketMessage(ws, message) {
        await this.init();
        if (this.basisWatchOf(ws) !== undefined)
            return;
        try {
            ws.close(1008, "unsupported socket");
        }
        catch {
        }
    }
    async webSocketClose(ws, code) {
        try {
            ws.close(code, "bye");
        }
        catch {
        }
    }
    async alarm() {
        await this.init();
        const watches = this.basisWatches();
        if (watches.length === 0)
            return;
        if (this.ws?.readyState !== 1 ||
            this.lastUpstreamAt === 0 ||
            Date.now() - this.lastUpstreamAt > LIVE_UPSTREAM_STALE_MS) {
            this.closeBasisWatches("upstream freshness lost");
            return;
        }
        const byHealthUrl = new Map();
        for (const item of watches) {
            const group = byHealthUrl.get(item[1].healthUrl);
            if (group === undefined)
                byHealthUrl.set(item[1].healthUrl, [item]);
            else
                group.push(item);
        }
        await Promise.all([...byHealthUrl].map(async ([healthUrl, group]) => {
            let currentDeployment;
            try {
                currentDeployment = await withAbortTimeout(LIVE_DEPLOYMENT_TIMEOUT_MS, async (signal) => {
                    const health = new URL(healthUrl);
                    health.searchParams.set("live-renew", crypto.randomUUID());
                    const response = await fetch(health, {
                        method: "GET",
                        headers: {
                            "cache-control": "no-cache",
                            ...internalHeaders(this.env),
                        },
                        redirect: "manual",
                        signal,
                    });
                    const value = response.headers.get(DEPLOYMENT_HEADER);
                    return response.ok && value !== null && value.length > 0 ? value : undefined;
                });
            }
            catch {
            }
            for (const [ws, watch] of group) {
                if (currentDeployment === watch.expectedDeployment)
                    continue;
                try {
                    ws.close(1000, "deployment changed");
                }
                catch {
                }
            }
        }));
        if (this.basisWatches().length > 0)
            await this.armDeploymentWatch();
    }
    async fetch(request) {
        const gate = internalGate(this.env, request);
        if (gate)
            return gate;
        await this.init();
        const url = new URL(request.url);
        if (url.pathname === "/server-identity") {
            return this.serveServerIdentityRoot(request);
        }
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
    serveServerIdentityRoot(request) {
        if (request.method !== "GET" && request.method !== "POST") {
            return json({ error: "method not allowed" }, 405);
        }
        const record = readServerIdentityRootRecord(this.getMeta("server-identity-root"));
        if (record.type === "existing") {
            return json({ root: record.root, created: false });
        }
        if (record.type === "unreadable") {
            return json({ error: SERVER_IDENTITY_UNREADABLE }, 409);
        }
        const created = generateServerIdentityRoot(Date.now());
        this.setMeta("server-identity-root", created);
        return json({ root: created, created: true });
    }
    serverIdentityQuarantine(keyId) {
        const decision = decideServerIdentityBinding(this.getMeta("server-identity-key"), keyId);
        if (decision.type !== "incompatible")
            return undefined;
        return json({ error: SERVER_IDENTITY_INCOMPATIBLE, persisted: decision.persisted }, 409);
    }
    async route(request, url, dbName) {
        if (url.pathname === "/watch")
            return this.upgradeBasisWatch(request);
        switch (url.pathname) {
            case "/basis": {
                await this.sync();
                await this.catchUpTo(requestedMinT(url.searchParams.get("minT") ?? request.headers.get("x-ramose-min-t")));
                if (!this.root)
                    return json({ error: "database has no root yet" }, 503);
                this.stats.basisServed++;
                if (this.stats.basisServed % 100 === 1)
                    this.log.debug("replica.basis", { db: this.dbName, t: this.basisT, rootT: this.root.t, novelty: this.entries.length, served: this.stats.basisServed });
                const basis = makeBasis(dbName, this.root, this.entries, this.ctx.id.toString().slice(0, 8));
                return json(basis);
            }
            case "/replication/revision": {
                if (request.method !== "POST")
                    return json({ error: "method not allowed" }, 405);
                const body = (await request.json());
                if ((body.action !== "remember" && body.action !== "resolve") ||
                    typeof body.revision !== "string" ||
                    !OPAQUE_REPLICATION_ID.test(body.revision) ||
                    typeof body.binding !== "string" ||
                    !OPAQUE_REPLICATION_ID.test(body.binding) ||
                    typeof body.keyId !== "string" ||
                    !SERVER_IDENTITY_KEY_ID.test(body.keyId)) {
                    return json({ error: "invalid replication revision request" }, 400);
                }
                const quarantined = this.serverIdentityQuarantine(body.keyId);
                if (quarantined !== undefined)
                    return quarantined;
                if (body.action === "resolve") {
                    const row = this.sql.exec(`SELECT basis_t FROM replication_revisions
             WHERE revision = ? AND binding = ?`, body.revision, body.binding).toArray()[0];
                    if (row === undefined ||
                        !Number.isSafeInteger(row.basis_t) ||
                        row.basis_t < 0)
                        return json({ found: false });
                    return json({ found: true, basisT: row.basis_t });
                }
                if (!Number.isSafeInteger(body.basisT) || body.basisT < 0) {
                    return json({ error: "invalid replication basis" }, 400);
                }
                const existing = this.sql.exec(`SELECT binding FROM replication_revisions WHERE revision = ?`, body.revision).toArray()[0];
                const storedBinding = this.getMeta("replication-binding");
                if (storedBinding !== undefined && storedBinding !== body.binding) {
                    return json({ error: "replication binding mismatch" }, 409);
                }
                if (storedBinding === undefined) {
                    this.setMeta("replication-binding", body.binding);
                }
                if (this.getMeta("server-identity-key") === undefined) {
                    this.setMeta("server-identity-key", body.keyId);
                }
                const bindingRevisionCount = this.sql.exec(`SELECT COUNT(*) AS n FROM replication_revisions WHERE binding = ?`, body.binding).toArray()[0]?.n;
                const decision = decideReplicationRevisionRetention({
                    ...(existing === undefined
                        ? {}
                        : { existingBinding: existing.binding }),
                    candidateBinding: body.binding,
                    bindingRevisionCount,
                });
                if (decision.type === "reject") {
                    return json({ ok: true, stored: false });
                }
                if (decision.type === "advance") {
                    this.sql.exec(`UPDATE replication_revisions
             SET basis_t = MAX(basis_t, ?)
             WHERE revision = ? AND binding = ?`, body.basisT, body.revision, body.binding);
                    return json({ ok: true, stored: true });
                }
                const priorTouched = this.sql.exec(`SELECT MAX(touched) AS touched FROM replication_revisions
           WHERE binding = ?`, body.binding).toArray()[0]?.touched;
                const touched = Math.max(Date.now(), typeof priorTouched === "number" ? priorTouched + 1 : 0);
                this.sql.exec(`INSERT INTO replication_revisions
             (revision, binding, basis_t, touched) VALUES (?, ?, ?, ?)`, body.revision, body.binding, body.basisT, touched);
                if (decision.evictCount > 0) {
                    this.sql.exec(`DELETE FROM replication_revisions
             WHERE binding = ? AND revision IN (
               SELECT revision FROM replication_revisions
               WHERE binding = ?
               ORDER BY touched ASC, revision ASC LIMIT ?
             )`, body.binding, body.binding, decision.evictCount);
                }
                return json({ ok: true, stored: true });
            }
            default:
                return json({ error: "not found" }, 404);
        }
    }
}
export class QueryReplicaDO extends QueryReplicaDOBase {
    constructor(ctx, env) {
        super(ctx, env);
    }
}
//# sourceMappingURL=replica-do.js.map