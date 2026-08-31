import { DurableObject } from "cloudflare:workers";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { CatalogId, DatabaseId, deriveResolvedDatabaseRoute, resolveBoundCatalogDefinition, } from "../authorization/index.js";
import { toJson } from "../core/index.js";
import { serverSealingKey } from "../replication/identity-root.js";
import { dbPrefix, prefixedBucket } from "../storage/index.js";
import { envInt } from "./env.js";
import { DEFAULT_CONFIG } from "./host.js";
import { internalGate } from "./internal.js";
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
class TransactorDOBase extends DurableObject {
    testing;
    core;
    databaseCatalogBindings;
    dbName;
    constructor(ctx, env, operationCatalogs, databaseCatalogBindings, testing) {
        super(ctx, env);
        this.testing = testing;
        if (testing?.enabled(env) === true)
            testing.reset();
        ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
        const row = ctx.storage.sql.exec(`SELECT v FROM meta WHERE k = 'db'`).toArray()[0];
        if (row)
            this.dbName = JSON.parse(row.v);
        this.databaseCatalogBindings = databaseCatalogBindings;
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
            ...(env.ANALYTICS !== undefined && { analytics: env.ANALYTICS }),
        };
        this.core = new Transactor(host, operationCatalogs === undefined
            ? undefined
            : {
                catalogs: operationCatalogs,
                ...(databaseCatalogBindings === undefined
                    ? {}
                    : { bindings: databaseCatalogBindings }),
                environment: env,
                now: () => host.now(),
                sealing: () => serverSealingKey(env),
            }, testing?.boundaries);
    }
    assign(db) {
        if (this.dbName === db)
            return;
        if (this.dbName !== undefined)
            throw new Error(`transactor already bound to database ${this.dbName}`);
        this.dbName = db;
        this.ctx.storage.sql.exec(`INSERT OR REPLACE INTO meta (k, v) VALUES ('db', ?)`, JSON.stringify(db));
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
        const testingEnabled = this.testing?.enabled(this.env) === true;
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
            if (!testingEnabled) {
                return new Response(JSON.stringify({ error: "not found" }), {
                    status: 404,
                    headers: { "content-type": "application/json" },
                });
            }
            return new Response(JSON.stringify(toJson({ ok: true, t: this.core.t })), { headers: { "content-type": "application/json" } });
        }
        if (url.pathname === "/provision-catalog" && request.method === "POST") {
            if (this.databaseCatalogBindings === undefined) {
                return new Response(JSON.stringify({ error: "catalog provisioning unavailable" }), {
                    status: 403,
                    headers: { "content-type": "application/json" },
                });
            }
            try {
                const body = await request.json();
                const raw = body?.derivation;
                if (typeof raw !== "object" || raw === null || Array.isArray(raw) ||
                    typeof raw.rootDatabase !== "string" ||
                    !Array.isArray(raw.graphs)) {
                    throw new Error("invalid database route derivation");
                }
                const graphs = raw.graphs.map((entry) => {
                    if (typeof entry !== "object" || entry === null || Array.isArray(entry) ||
                        !Number.isSafeInteger(entry.graphEntity) ||
                        typeof entry.catalogKey !== "string") {
                        throw new Error("invalid dynamic Graph binding");
                    }
                    return Object.freeze({
                        graphEntity: entry.graphEntity,
                        catalogKey: CatalogId.make(entry.catalogKey),
                    });
                });
                const derivation = Object.freeze({
                    rootDatabase: DatabaseId.make(raw.rootDatabase),
                    graphs: Object.freeze(graphs),
                });
                const route = await Effect.runPromise(deriveResolvedDatabaseRoute(this.databaseCatalogBindings, derivation));
                if (route.database !== DatabaseId.make(this.dbName)) {
                    throw new Error("database route derivation does not match this transactor");
                }
                const deployed = Result.getOrThrow(resolveBoundCatalogDefinition(this.databaseCatalogBindings, route));
                const t = await this.core.provisionCatalog(deployed.definition);
                return new Response(JSON.stringify({ t }), {
                    headers: { "content-type": "application/json" },
                });
            }
            catch (cause) {
                return new Response(JSON.stringify({
                    error: cause instanceof Error ? cause.message : "catalog provisioning failed",
                }), {
                    status: 500,
                    headers: { "content-type": "application/json" },
                });
            }
        }
        if (testingEnabled) {
            const testAdmin = await this.testing.handleAdmin(request, url.pathname, (reason) => this.ctx.abort(reason), {
                operationReceiptCount: () => this.core.operationReceiptCount(),
            });
            if (testAdmin !== undefined)
                return testAdmin;
        }
        if (!testingEnabled &&
            (url.pathname === "/transact" ||
                url.pathname === "/provision" ||
                url.pathname.startsWith("/admin/"))) {
            return new Response(JSON.stringify({ error: "not found" }), {
                status: 404,
                headers: { "content-type": "application/json" },
            });
        }
        return this.core.handleRequest(request);
    }
}
export const createTransactorDO = (operationCatalogs, databaseCatalogBindings) => class TransactorDO extends TransactorDOBase {
    constructor(ctx, env) {
        super(ctx, env, operationCatalogs, databaseCatalogBindings);
    }
};
export const createTestingTransactorDO = (testing, operationCatalogs, databaseCatalogBindings) => class TransactorDO extends TransactorDOBase {
    constructor(ctx, env) {
        super(ctx, env, operationCatalogs, databaseCatalogBindings, testing);
    }
};
export class TransactorDO extends TransactorDOBase {
    constructor(ctx, env) {
        super(ctx, env);
    }
}
//# sourceMappingURL=transactor-do.js.map