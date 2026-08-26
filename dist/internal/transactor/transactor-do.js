/**
 * Transactor Durable Object — exactly one per logical database.
 *
 * Thin shell: adapts the DO runtime (SQLite storage, hibernating WebSockets,
 * alarms, R2 binding) to `TransactorHost` and forwards everything to the
 * runtime-agnostic `Transactor` (transactor.ts). All logic lives there and is
 * tested under Bun; this file only maps APIs.
 *
 *   GET /subscribe?from=<t>  (WebSocket upgrade) → hello / tx / root / gap frames
 *   everything else → Transactor.handleRequest
 */
import { DurableObject } from "cloudflare:workers";
import { toJson } from "../core/index.js";
import { dbPrefix, prefixedBucket } from "../storage/index.js";
import { envInt } from "./env.js";
import { DEFAULT_CONFIG } from "./host.js";
import { internalGate } from "./internal.js";
import { enforcedPolicy } from "./policy.js";
import { Transactor } from "./transactor.js";
export function configFromEnv(env) {
    return {
        ...DEFAULT_CONFIG,
        indexIntervalMs: envInt(env.RAMOSE_INDEX_INTERVAL_MS, DEFAULT_CONFIG.indexIntervalMs),
        indexTxThreshold: envInt(env.RAMOSE_INDEX_TX_THRESHOLD, DEFAULT_CONFIG.indexTxThreshold),
        indexMaxTxsPerRun: envInt(env.RAMOSE_INDEX_MAX_TXS_PER_RUN, DEFAULT_CONFIG.indexMaxTxsPerRun),
        logKeepTxs: envInt(env.RAMOSE_LOG_KEEP_TXS, DEFAULT_CONFIG.logKeepTxs),
        gcEveryNIndexes: envInt(env.RAMOSE_GC_EVERY_N_INDEXES, DEFAULT_CONFIG.gcEveryNIndexes),
        retainRoots: envInt(env.RAMOSE_RETAIN_ROOTS, DEFAULT_CONFIG.retainRoots),
        maxBatch: envInt(env.RAMOSE_MAX_BATCH, DEFAULT_CONFIG.maxBatch),
        timingYields: env.RAMOSE_TIMING_YIELDS === "1",
    };
}
export class TransactorDO extends DurableObject {
    core;
    dbName;
    constructor(ctx, env) {
        super(ctx, env);
        ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
        const row = ctx.storage.sql.exec(`SELECT v FROM meta WHERE k = 'db'`).toArray()[0];
        if (row)
            this.dbName = JSON.parse(row.v);
        const self = this;
        const host = {
            get dbName() {
                if (!self.dbName)
                    throw new Error("transactor has no database assigned (pass ?db=<name>)");
                return self.dbName;
            },
            sql: ctx.storage.sql,
            transactionSync: (fn) => ctx.storage.transactionSync(fn),
            get bucket() {
                return prefixedBucket(env.STORE, dbPrefix(host.dbName));
            },
            sockets: () => ctx.getWebSockets(),
            getAlarm: () => ctx.storage.getAlarm(),
            setAlarm: (time) => ctx.storage.setAlarm(time),
            abort: (reason) => ctx.abort(reason),
            now: () => Date.now(),
            config: configFromEnv(env),
            // bound in alchemy.run.ts as ANALYTICS; undefined = metrics disabled
            analytics: env.ANALYTICS,
            // parsed once per isolate; present = the commit loop enforces it
            policy: enforcedPolicy(env),
        };
        this.core = new Transactor(host);
    }
    /** In-process access for other code running in the same isolate (tests, worker). */
    get transactor() {
        return this.core;
    }
    /** Bind this object to a database name (idempotent; persisted). */
    assign(db) {
        if (this.dbName === db)
            return;
        if (this.dbName !== undefined)
            throw new Error(`transactor already bound to database ${this.dbName}`);
        this.dbName = db;
        this.ctx.storage.sql.exec(`INSERT OR REPLACE INTO meta (k, v) VALUES ('db', ?)`, JSON.stringify(db));
    }
    transact(db, tx) {
        this.assign(db);
        return this.core.init().then(() => this.core.transact(tx));
    }
    async webSocketMessage(ws, message) {
        await this.core.init();
        this.core.onSocketMessage(ws, message);
    }
    async webSocketClose(ws, code) {
        try {
            ws.close(code, "bye");
        }
        catch { }
    }
    async alarm() {
        await this.core.onAlarm();
    }
    async fetch(request) {
        // reachable only from the peer Worker (and the replicas), /subscribe included
        const gate = internalGate(this.env, request);
        if (gate)
            return gate;
        const url = new URL(request.url);
        const db = url.searchParams.get("db");
        if (db) {
            try {
                this.assign(db);
            }
            catch (err) {
                return new Response(JSON.stringify({ error: String(err) }), { status: 409, headers: { "content-type": "application/json" } });
            }
        }
        if (!this.dbName)
            return new Response(JSON.stringify({ error: "missing ?db=" }), { status: 400, headers: { "content-type": "application/json" } });
        await this.core.init();
        if (url.pathname === "/subscribe") {
            if (request.headers.get("Upgrade") !== "websocket")
                return new Response("expected websocket", { status: 426 });
            const from = Number(url.searchParams.get("from") ?? "0");
            const pair = new WebSocketPair();
            const [client, server] = [pair[0], pair[1]];
            this.ctx.acceptWebSocket(server);
            this.core.onSubscribe(server, from);
            return new Response(null, { status: 101, webSocket: client });
        }
        if (url.pathname === "/health") {
            return new Response(JSON.stringify(toJson({ ok: true, t: this.core.t })), { headers: { "content-type": "application/json" } });
        }
        return this.core.handleRequest(request);
    }
}
//# sourceMappingURL=transactor-do.js.map