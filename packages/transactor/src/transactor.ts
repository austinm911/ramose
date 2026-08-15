/**
 * Transactor — the single writer of one logical Ripple database.
 *
 * Runtime-agnostic (see host.ts): the Durable Object shell and the Bun test
 * harness both drive this class.
 *
 *   validate against schema → resolve tempids / uniques (reads via its own
 *   segment source + own novelty) → assign monotonic `t` → GROUP COMMIT to
 *   the SQL log → ack → broadcast novelty frames → (alarm) incremental index.
 *
 * Group commit: every transaction that arrives while a storage write is in
 * flight (or while the current batch is being resolved) is coalesced into the
 * next single SQL write. `t` is assigned in arrival order and persisted in
 * the same order, so the durable log never has gaps or duplicates: a batch
 * either lands entirely or not at all, and if it does not land the instance
 * is aborted and rebuilt from durable state (in-memory `t` is discarded).
 *
 * HTTP surface (the DO shell forwards `fetch` here; `/subscribe` upgrades are
 * done by the shell, which then calls `onSubscribe`):
 *   POST /transact   { tx: TxData }   → { t, txEid, tempids, datoms }
 *   GET  /info                        → { t, root, novelty, logWatermark, ... }
 *   GET  /log?from=&to=               → { entries: NoveltyFrameV1[] }
 *   POST /admin/index                 → run the indexer now
 *   POST /admin/gc                    → run GC now
 */

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
import { type SocketLike, type TransactorHost } from "./host.ts";
import { Indexer } from "./indexer.ts";

export interface TxAck {
  t: number;
  txEid: number;
  tempids: Record<string, number>;
  datoms: number;
}

export interface TransactorStats {
  txs: number;
  batches: number;
  maxBatch: number;
  rejected: number;
  indexRuns: number;
  broadcasts: number;
}

interface Pending {
  tx: TxData;
  resolve: (r: TxAck) => void;
  reject: (e: unknown) => void;
}

export class TransactorDeadError extends Error {
  constructor(reason: string) {
    super(`transactor aborted: ${reason}`);
  }
}

const yieldToEventLoop = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(toJson(body)), { status, headers: { "content-type": "application/json", ...headers } });

export class Transactor {
  private ready: Promise<void> | undefined;
  private conn!: Connection;
  private store!: R2NodeStore;
  private rootRecord!: RootRecord;
  private logWatermark = 0;
  private queue: Pending[] = [];
  private committing = false;
  private indexer!: Indexer;
  private txSinceIndex = 0;
  private dead: string | undefined;
  readonly stats: TransactorStats = { txs: 0, batches: 0, maxBatch: 0, rejected: 0, indexRuns: 0, broadcasts: 0 };

  constructor(readonly host: TransactorHost) {}

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  /** Idempotent: load durable state (or bootstrap a fresh database). */
  init(): Promise<void> {
    if (!this.ready) this.ready = this.boot();
    return this.ready;
  }

  private async boot(): Promise<void> {
    const sql = this.host.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS log (t INTEGER PRIMARY KEY, tx_instant INTEGER NOT NULL, datoms BLOB NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
    this.store = new R2NodeStore(this.host.bucket, { codec: gzipCodec, maxNodes: 4096 });

    let rec = this.getMeta<RootRecord>("root") ?? (await readCurrentRoot(this.host.bucket));
    if (!rec) {
      // Fresh database: empty trees + bootstrap tx at t = 1 in the log.
      const roots = await emptyRoots(this.store);
      const fresh = rootsToRecord(roots, { log_watermark: 0, next_eid: FIRST_USER_EID, codec: gzipCodec.name });
      const boot = bootstrapDatoms();
      this.host.transactionSync(() => {
        this.appendLogRow({ t: 1, txInstant: this.host.now(), datoms: boot });
        this.setMeta("root", fresh);
        this.setMeta("next_eid", FIRST_USER_EID);
      });
      rec = fresh;
    }
    this.rootRecord = rec;
    this.logWatermark = rec.log_watermark;
    const roots: Roots = recordToRoots(rec);
    const nextEid = this.getMeta<number>("next_eid") ?? rec.next_eid;
    const logDatoms = this.readLogDatoms(roots.t);
    this.conn = await Connection.restore(this.store, roots, logDatoms, nextEid, { now: () => this.host.now() });
    // txs already in the log but not yet indexed count toward the next index run
    this.txSinceIndex = Math.max(0, this.conn.t - roots.t);
    const c = this.host.config;
    this.indexer = new Indexer(this, {
      intervalMs: c.indexIntervalMs,
      txThreshold: c.indexTxThreshold,
      maxTxsPerRun: c.indexMaxTxsPerRun,
      logKeepTxs: c.logKeepTxs,
      gcEveryN: c.gcEveryNIndexes,
      retainRoots: c.retainRoots,
    });
    if (this.conn.t > roots.t) await this.indexer.schedule();
  }

  // ---------------------------------------------------------------------------
  // SQL helpers
  // ---------------------------------------------------------------------------

  private getMeta<T>(k: string): T | undefined {
    const row = this.host.sql.exec(`SELECT v FROM meta WHERE k = ?`, k).toArray()[0];
    return row ? (JSON.parse(row.v as string) as T) : undefined;
  }
  private setMeta(k: string, v: unknown): void {
    this.host.sql.exec(`INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)`, k, JSON.stringify(v));
  }
  private appendLogRow(e: LogEntry): void {
    const body = encodeLogChunk([e]);
    // DO SqlStorage binds ArrayBuffer; bun:sqlite binds Uint8Array. A fresh ArrayBuffer works for both.
    const buf = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
    this.host.sql.exec(`INSERT INTO log (t, tx_instant, datoms) VALUES (?, ?, ?)`, e.t, e.txInstant, buf);
  }
  /** Log entries with from < t <= to (ascending). */
  readLogEntries(from: number, to = Number.MAX_SAFE_INTEGER, limit = 100_000): LogEntry[] {
    const rows = this.host.sql.exec(`SELECT t, tx_instant, datoms FROM log WHERE t > ? AND t <= ? ORDER BY t LIMIT ?`, from, to, limit).toArray();
    const out: LogEntry[] = [];
    for (const r of rows) {
      const raw = r.datoms as ArrayBuffer | Uint8Array;
      const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      const [entry] = decodeLogChunk(buf);
      out.push(entry);
    }
    return out;
  }
  private readLogDatoms(afterT: number): Datom[] {
    const out: Datom[] = [];
    for (const e of this.readLogEntries(afterT)) for (const d of e.datoms) out.push(d);
    return out;
  }
  /** Lowest t still present in the SQL log (0 if empty). */
  earliestLogT(): number {
    const row = this.host.sql.exec(`SELECT MIN(t) AS t FROM log`).toArray()[0];
    return (row?.t as number | null) ?? 0;
  }
  pruneLog(throughT: number): number {
    const before = this.host.sql.exec(`SELECT COUNT(*) AS n FROM log WHERE t <= ?`, throughT).toArray()[0].n as number;
    this.host.sql.exec(`DELETE FROM log WHERE t <= ?`, throughT);
    return before;
  }

  // ---------------------------------------------------------------------------
  // Accessors (indexer, shell, tests)
  // ---------------------------------------------------------------------------

  get connection(): Connection {
    return this.conn;
  }
  get nodeStore(): R2NodeStore {
    return this.store;
  }
  get bucket() {
    return this.host.bucket;
  }
  get currentRootRecord(): RootRecord {
    return this.rootRecord;
  }
  get watermark(): number {
    return this.logWatermark;
  }
  get t(): number {
    return this.conn.t;
  }
  get txsSinceIndex(): number {
    return this.txSinceIndex;
  }
  get isDead(): boolean {
    return this.dead !== undefined;
  }
  /** Called by the indexer after publishing a new root. */
  adoptRoot(rec: RootRecord): void {
    this.rootRecord = rec;
    this.logWatermark = rec.log_watermark;
    this.setMeta("root", rec);
    this.txSinceIndex = Math.max(0, this.conn.t - rec.t);
    this.stats.indexRuns++;
    this.broadcast({ v: 1, kind: "root", root: rec });
  }

  // ---------------------------------------------------------------------------
  // Group commit
  // ---------------------------------------------------------------------------

  /** Submit a transaction. Resolves once it is durably committed. */
  transact(tx: TxData): Promise<TxAck> {
    if (this.dead !== undefined) return Promise.reject(new TransactorDeadError(this.dead));
    return new Promise<TxAck>((resolve, reject) => {
      this.queue.push({ tx, resolve, reject });
      if (!this.committing) {
        this.committing = true;
        void this.commitLoop();
      }
    });
  }

  private takeBatch(): Pending[] {
    const max = this.host.config.maxBatch;
    if (max > 0 && this.queue.length > max) return this.queue.splice(0, max);
    const b = this.queue;
    this.queue = [];
    return b;
  }

  private async commitLoop(): Promise<void> {
    try {
      await this.init();
      while (this.queue.length > 0 && this.dead === undefined) {
        // Open the batching window: yield to the event loop once so requests
        // that are already in flight (separate events in a Durable Object)
        // land in the queue and share the coming storage write.
        await yieldToEventLoop();
        // Everything queued while the previous batch was in flight forms the next batch.
        const batch = this.takeBatch();
        const entries: LogEntry[] = [];
        const acks: { p: Pending; ack: TxAck }[] = [];
        for (const p of batch) {
          try {
            const rep = await this.conn.transact(p.tx);
            const txInstant = rep.txData[0]?.v as number; // :db/txInstant is first
            entries.push({ t: rep.t, txInstant, datoms: rep.txData });
            acks.push({ p, ack: { t: rep.t, txEid: rep.txEid, tempids: rep.tempids, datoms: rep.txData.length } });
          } catch (err) {
            this.stats.rejected++;
            p.reject(err);
          }
        }
        if (entries.length === 0) continue;
        try {
          // ONE storage write for the whole batch (group commit).
          this.host.transactionSync(() => {
            for (const e of entries) this.appendLogRow(e);
            this.setMeta("next_eid", this.conn.nextEntityId);
          });
        } catch (err) {
          // Memory and durable state diverged (t was assigned, nothing landed):
          // fail this batch and everything behind it, then discard the instance.
          this.die(`log write failed: ${err instanceof Error ? err.message : String(err)}`, err, acks.map((a) => a.p));
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
    } catch (err) {
      this.die(`commit loop failed: ${err instanceof Error ? err.message : String(err)}`, err, []);
    } finally {
      this.committing = false;
      if (this.queue.length > 0 && this.dead === undefined) {
        this.committing = true;
        void this.commitLoop();
      }
    }
  }

  private die(reason: string, cause: unknown, inflight: Pending[]): void {
    if (this.dead !== undefined) return;
    this.dead = reason;
    const err = cause instanceof Error ? cause : new TransactorDeadError(reason);
    for (const p of inflight) p.reject(err);
    for (const p of this.queue) p.reject(new TransactorDeadError(reason));
    this.queue = [];
    this.host.abort(reason);
  }

  // ---------------------------------------------------------------------------
  // Novelty subscribers
  // ---------------------------------------------------------------------------

  private broadcast(frame: unknown): void {
    const msg = JSON.stringify(frame);
    this.stats.broadcasts++;
    for (const ws of this.host.sockets()) {
      try {
        ws.send(msg);
      } catch {
        // closed socket; the host cleans up
      }
    }
  }

  /** New subscriber: hello + catch-up from `from` (exclusive). */
  onSubscribe(ws: SocketLike, from: number): void {
    ws.send(JSON.stringify({ v: 1, kind: "hello", t: this.conn.t, root: this.rootRecord }));
    this.sendCatchUp(ws, Number.isFinite(from) ? from : 0);
  }

  /** Subscriber control message (resume / ping). */
  onSocketMessage(ws: SocketLike, message: string | ArrayBuffer): void {
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

  private sendCatchUp(ws: SocketLike, from: number): void {
    const t = this.conn.t;
    if (from >= t) return;
    const earliest = this.earliestLogT();
    if (earliest === 0 || earliest > from + 1) {
      // The SQL log no longer holds (from, earliest): subscriber must read log/ chunks from R2.
      ws.send(JSON.stringify({ v: 1, kind: "gap", from: Math.max(from, earliest - 1) }));
      from = Math.max(from, earliest - 1);
    }
    for (const e of this.readLogEntries(from, t)) ws.send(JSON.stringify(txFrame(e)));
  }

  // ---------------------------------------------------------------------------
  // Alarm → indexer
  // ---------------------------------------------------------------------------

  async onAlarm(): Promise<void> {
    await this.init();
    await this.indexer.onAlarm();
  }

  // ---------------------------------------------------------------------------
  // HTTP
  // ---------------------------------------------------------------------------

  info() {
    return {
      t: this.conn.t,
      root: this.rootRecord,
      novelty: this.conn.noveltyCount,
      txsSinceIndex: this.txSinceIndex,
      logWatermark: this.logWatermark,
      earliestLogT: this.earliestLogT(),
      nextEid: this.conn.nextEntityId,
      subscribers: this.host.sockets().length,
      stats: this.stats,
      store: this.store.stats,
      indexer: this.indexer.status(),
    };
  }

  async handleRequest(request: Request): Promise<Response> {
    await this.init();
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === "/transact" && request.method === "POST") {
        const body = fromJson(await request.json()) as { tx?: TxData };
        if (!body || !Array.isArray(body.tx)) return json({ error: "body must be { tx: [...] }" }, 400);
        const ack = await this.transact(body.tx);
        return json(ack);
      }
      if (path === "/info") return json(this.info());
      if (path === "/log") {
        const from = Number(url.searchParams.get("from") ?? "0");
        const to = Number(url.searchParams.get("to") ?? String(Number.MAX_SAFE_INTEGER));
        const entries = this.readLogEntries(from, to, 10_000);
        const frames: NoveltyFrameV1[] = entries.map(txFrame);
        return json({ from, to, earliestLogT: this.earliestLogT(), t: this.conn.t, entries: frames });
      }
      if (path === "/admin/index" && request.method === "POST") return json(await this.indexer.runNow());
      if (path === "/admin/gc" && request.method === "POST") return json(await this.indexer.gcNow());
      return json({ error: "not found" }, 404);
    } catch (err) {
      if (err instanceof TxError) return json({ error: err.message, code: err.code }, 409);
      if (err instanceof TransactorDeadError) return json({ error: err.message }, 503, { "retry-after": "0" });
      const msg = err instanceof Error ? err.message : String(err);
      return json({ error: msg }, 500);
    }
  }
}
