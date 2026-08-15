/**
 * Transactor Durable Object — exactly one per logical database.
 *
 * Responsibilities (spec §2, M2/M4):
 *   - validate + resolve transactions against its own Db view (segments via R2 + own novelty)
 *   - assign monotonic `t`, group-commit to the DO SQLite log
 *   - broadcast novelty frames to WebSocket subscribers (QueryReplica DOs)
 *   - own the root pointer; alarm-driven incremental indexing (see indexer.ts)
 *
 * HTTP surface (reached through the Worker via DO stub fetch):
 *   POST /transact            { tx: TxData }             → { t, txEid, tempids, datoms }
 *   GET  /info                                           → { t, root, novelty, logWatermark, ... }
 *   GET  /log?from=&to=                                  → { entries: NoveltyFrameV1[] }
 *   GET  /subscribe?from=<t>  (WebSocket upgrade)        → hello / tx / root / gap frames
 *   POST /admin/index                                    → run the indexer now
 *   POST /admin/gc                                       → run GC now
 */

import { DurableObject } from "cloudflare:workers";
import {
  Connection,
  type Datom,
  type LogEntry,
  type NoveltyFrameV1,
  type RootRecord,
  type Roots,
  type TxData,
  TxError,
  bootstrapDatoms,
  decodeLogChunk,
  emptyRoots,
  encodeLogChunk,
  fromJson,
  gzipCodec,
  toJson,
  txFrame,
  FIRST_USER_EID,
} from "@ripple/core";
import { R2NodeStore, readCurrentRoot, recordToRoots, rootsToRecord } from "@ripple/storage";
import { type RippleEnv, envInt } from "./env.ts";
import { Indexer } from "./indexer.ts";

interface Pending {
  tx: TxData;
  resolve: (r: TxAck) => void;
  reject: (e: unknown) => void;
}

export interface TxAck {
  t: number;
  txEid: number;
  tempids: Record<string, number>;
  datoms: number;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(toJson(body)), { status, headers: { "content-type": "application/json", ...headers } });

export class TransactorDO extends DurableObject<RippleEnv> {
  private readonly sql: SqlStorage;
  private ready: Promise<void> | undefined;
  private conn!: Connection;
  private store!: R2NodeStore;
  private rootRecord!: RootRecord;
  private logWatermark = 0;
  private queue: Pending[] = [];
  private committing = false;
  private indexer!: Indexer;
  private txSinceIndex = 0;
  /** stats */
  readonly stats = { txs: 0, batches: 0, maxBatch: 0, indexRuns: 0, gcRuns: 0 };

  constructor(ctx: DurableObjectState, env: RippleEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  private init(): Promise<void> {
    if (!this.ready) this.ready = this.boot();
    return this.ready;
  }

  private async boot(): Promise<void> {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS log (t INTEGER PRIMARY KEY, tx_instant INTEGER NOT NULL, datoms BLOB NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
    this.store = new R2NodeStore(this.env.STORE, { codec: gzipCodec, maxNodes: 4096 });

    let rec = this.getMeta<RootRecord>("root") ?? (await readCurrentRoot(this.env.STORE));
    if (!rec) {
      // Fresh database: empty trees + bootstrap tx at t = 1 in the log.
      const roots = await emptyRoots(this.store);
      rec = rootsToRecord(roots, { log_watermark: 0, next_eid: FIRST_USER_EID, codec: gzipCodec.name });
      const boot = bootstrapDatoms();
      this.ctx.storage.transactionSync(() => {
        this.appendLogRow({ t: 1, txInstant: Date.now(), datoms: boot });
        this.setMeta("root", rec);
        this.setMeta("next_eid", FIRST_USER_EID);
      });
    }
    this.rootRecord = rec;
    this.logWatermark = rec.log_watermark;
    const roots: Roots = recordToRoots(rec);
    const nextEid = this.getMeta<number>("next_eid") ?? rec.next_eid;
    const logDatoms = this.readLogDatoms(roots.t);
    this.conn = await Connection.restore(this.store, roots, logDatoms, nextEid, { now: () => Date.now() });
    this.indexer = new Indexer(this, {
      intervalMs: envInt(this.env.RIPPLE_INDEX_INTERVAL_MS, 5_000),
      txThreshold: envInt(this.env.RIPPLE_INDEX_TX_THRESHOLD, 500),
      maxTxsPerRun: envInt(this.env.RIPPLE_INDEX_MAX_TXS_PER_RUN, 5_000),
      logKeepTxs: envInt(this.env.RIPPLE_LOG_KEEP_TXS, 20_000),
      gcEveryN: envInt(this.env.RIPPLE_GC_EVERY_N_INDEXES, 50),
      retainRoots: envInt(this.env.RIPPLE_RETAIN_ROOTS, 20),
    });
    if (this.conn.t > roots.t) await this.indexer.schedule();
  }

  // ---------------------------------------------------------------------------
  // SQLite helpers
  // ---------------------------------------------------------------------------

  private getMeta<T>(k: string): T | undefined {
    const row = this.sql.exec(`SELECT v FROM meta WHERE k = ?`, k).toArray()[0];
    return row ? (JSON.parse(row.v as string) as T) : undefined;
  }
  private setMeta(k: string, v: unknown): void {
    this.sql.exec(`INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)`, k, JSON.stringify(v));
  }
  private appendLogRow(e: LogEntry): void {
    const body = encodeLogChunk([e]);
    this.sql.exec(`INSERT INTO log (t, tx_instant, datoms) VALUES (?, ?, ?)`, e.t, e.txInstant, body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength));
  }
  /** Log entries with from < t <= to (ascending). */
  readLogEntries(from: number, to = Number.MAX_SAFE_INTEGER, limit = 100_000): LogEntry[] {
    const rows = this.sql.exec(`SELECT t, tx_instant, datoms FROM log WHERE t > ? AND t <= ? ORDER BY t LIMIT ?`, from, to, limit).toArray();
    const out: LogEntry[] = [];
    for (const r of rows) {
      const buf = new Uint8Array(r.datoms as ArrayBuffer);
      const [entry] = decodeLogChunk(buf);
      out.push(entry);
    }
    return out;
  }
  private readLogDatoms(afterT: number): Datom[] {
    const out: Datom[] = [];
    for (const e of this.readLogEntries(afterT)) out.push(...e.datoms);
    return out;
  }
  /** Lowest t still present in the SQLite log (0 if empty). */
  earliestLogT(): number {
    const row = this.sql.exec(`SELECT MIN(t) AS t FROM log`).toArray()[0];
    return (row?.t as number | null) ?? 0;
  }
  pruneLog(throughT: number): number {
    const before = this.sql.exec(`SELECT COUNT(*) AS n FROM log WHERE t <= ?`, throughT).toArray()[0].n as number;
    this.sql.exec(`DELETE FROM log WHERE t <= ?`, throughT);
    return before;
  }

  // ---------------------------------------------------------------------------
  // Accessors for the indexer
  // ---------------------------------------------------------------------------

  get connection(): Connection {
    return this.conn;
  }
  get nodeStore(): R2NodeStore {
    return this.store;
  }
  get bucket(): R2Bucket {
    return this.env.STORE;
  }
  get currentRootRecord(): RootRecord {
    return this.rootRecord;
  }
  get watermark(): number {
    return this.logWatermark;
  }
  get durableStorage(): DurableObjectStorage {
    return this.ctx.storage;
  }
  /** Called by the indexer after publishing a new root. */
  adoptRoot(rec: RootRecord): void {
    this.rootRecord = rec;
    this.logWatermark = rec.log_watermark;
    this.setMeta("root", rec);
    this.txSinceIndex = 0;
    this.stats.indexRuns++;
    this.broadcast({ v: 1, kind: "root", root: rec });
  }
  get txsSinceIndex(): number {
    return this.txSinceIndex;
  }

  // ---------------------------------------------------------------------------
  // Group commit
  // ---------------------------------------------------------------------------

  transact(tx: TxData): Promise<TxAck> {
    return new Promise<TxAck>((resolve, reject) => {
      this.queue.push({ tx, resolve, reject });
      if (!this.committing) {
        this.committing = true;
        void this.commitLoop();
      }
    });
  }

  private async commitLoop(): Promise<void> {
    try {
      while (this.queue.length > 0) {
        // Everything queued while the previous batch was in flight forms the next batch.
        const batch = this.queue;
        this.queue = [];
        const entries: LogEntry[] = [];
        const acks: { p: Pending; ack: TxAck }[] = [];
        for (const p of batch) {
          try {
            const rep = await this.conn.transact(p.tx);
            const txInstant = rep.txData[0]?.v as number; // :db/txInstant is first
            entries.push({ t: rep.t, txInstant, datoms: rep.txData });
            acks.push({ p, ack: { t: rep.t, txEid: rep.txEid, tempids: rep.tempids, datoms: rep.txData.length } });
          } catch (err) {
            p.reject(err);
          }
        }
        if (entries.length > 0) {
          try {
            // ONE storage write for the whole batch (group commit).
            this.ctx.storage.transactionSync(() => {
              for (const e of entries) this.appendLogRow(e);
              this.setMeta("next_eid", this.conn.nextEntityId);
            });
          } catch (err) {
            // Memory and durable state diverged: fail the batch and reset the object.
            for (const a of acks) a.p.reject(err);
            this.ctx.abort("log write failed");
            return;
          }
          this.stats.txs += entries.length;
          this.stats.batches++;
          if (entries.length > this.stats.maxBatch) this.stats.maxBatch = entries.length;
          this.txSinceIndex += entries.length;
          for (const a of acks) a.p.resolve(a.ack);
          for (const e of entries) this.broadcast(txFrame(e));
          await this.indexer.maybeSchedule();
        }
      }
    } finally {
      this.committing = false;
      if (this.queue.length > 0) {
        this.committing = true;
        void this.commitLoop();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // WebSocket hub
  // ---------------------------------------------------------------------------

  private broadcast(frame: unknown): void {
    const msg = JSON.stringify(frame);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg);
      } catch {
        // closed socket; hibernation API cleans up
      }
    }
  }

  private sendCatchUp(ws: WebSocket, from: number): void {
    const t = this.conn.t;
    if (from >= t) return;
    const earliest = this.earliestLogT();
    if (earliest === 0 || earliest > from + 1) {
      // The SQLite log no longer holds (from, earliest): subscriber must read log/ chunks from R2.
      ws.send(JSON.stringify({ v: 1, kind: "gap", from: Math.max(from, earliest - 1) }));
      from = Math.max(from, earliest - 1);
    }
    for (const e of this.readLogEntries(from, t)) ws.send(JSON.stringify(txFrame(e)));
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.init();
    if (typeof message !== "string") return;
    let msg: any;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (msg?.kind === "resume" && typeof msg.from === "number") this.sendCatchUp(ws, msg.from);
    else if (msg?.kind === "ping") ws.send(JSON.stringify({ v: 1, kind: "pong", t: this.conn.t }));
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code, "bye");
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // Alarm → indexer
  // ---------------------------------------------------------------------------

  override async alarm(): Promise<void> {
    await this.init();
    await this.indexer.onAlarm();
  }

  // ---------------------------------------------------------------------------
  // HTTP
  // ---------------------------------------------------------------------------

  override async fetch(request: Request): Promise<Response> {
    await this.init();
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === "/subscribe") {
        if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
        const from = Number(url.searchParams.get("from") ?? "0");
        const pair = new WebSocketPair();
        const [client, server] = [pair[0], pair[1]];
        this.ctx.acceptWebSocket(server);
        server.send(JSON.stringify({ v: 1, kind: "hello", t: this.conn.t, root: this.rootRecord }));
        this.sendCatchUp(server, Number.isFinite(from) ? from : 0);
        return new Response(null, { status: 101, webSocket: client });
      }
      if (path === "/transact" && request.method === "POST") {
        const body = fromJson(await request.json()) as { tx?: TxData };
        if (!body || !Array.isArray(body.tx)) return json({ error: "body must be { tx: [...] }" }, 400);
        const ack = await this.transact(body.tx);
        return json(ack);
      }
      if (path === "/info") {
        return json({
          t: this.conn.t,
          root: this.rootRecord,
          novelty: this.conn.noveltyCount,
          txsSinceIndex: this.txSinceIndex,
          logWatermark: this.logWatermark,
          earliestLogT: this.earliestLogT(),
          nextEid: this.conn.nextEntityId,
          subscribers: this.ctx.getWebSockets().length,
          stats: this.stats,
          store: this.store.stats,
          indexer: this.indexer.status(),
        });
      }
      if (path === "/log") {
        const from = Number(url.searchParams.get("from") ?? "0");
        const to = Number(url.searchParams.get("to") ?? String(Number.MAX_SAFE_INTEGER));
        const entries = this.readLogEntries(from, to, 10_000);
        const frames: NoveltyFrameV1[] = entries.map(txFrame);
        return json({ from, to, earliestLogT: this.earliestLogT(), t: this.conn.t, entries: frames });
      }
      if (path === "/admin/index" && request.method === "POST") {
        const res = await this.indexer.runNow();
        return json(res);
      }
      if (path === "/admin/gc" && request.method === "POST") {
        const res = await this.indexer.gcNow();
        return json(res);
      }
      return json({ error: "not found" }, 404);
    } catch (err) {
      if (err instanceof TxError) return json({ error: err.message, code: err.code }, 409);
      const msg = err instanceof Error ? err.message : String(err);
      return json({ error: msg }, 500);
    }
  }
}
