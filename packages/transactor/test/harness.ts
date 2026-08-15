/**
 * Bun test/bench harness for the Transactor: `bun:sqlite` stands in for DO
 * SQLite, an in-memory map for R2, plain objects for WebSockets. Supports
 * fault injection (fail the N-th storage write) and "restart" (a new
 * Transactor over the same SQLite file), so the durability contract —
 * contiguous `t`, no duplicates, batches all-or-nothing — can be checked.
 */
import { Database } from "bun:sqlite";
import { MemoryBucket } from "@ripple/storage/memory.ts";
export { MemoryBucket };
import { DEFAULT_CONFIG, type SocketLike, type SqlLike, type TransactorConfig, type TransactorHost, Transactor } from "../src/index.ts";

/** Fake subscriber socket collecting frames. */
export class FakeSocket implements SocketLike {
  readonly frames: any[] = [];
  closed = false;
  send(data: string): void {
    if (this.closed) throw new Error("socket closed");
    this.frames.push(JSON.parse(data));
  }
  close(): void {
    this.closed = true;
  }
  ofKind(kind: string) {
    return this.frames.filter((f) => f.kind === kind);
  }
}

/** bun:sqlite as DO-style SqlLike. */
export function sqliteLike(db: Database): SqlLike {
  const cache = new Map<string, ReturnType<Database["query"]>>();
  return {
    exec(query: string, ...bindings: unknown[]) {
      let stmt = cache.get(query);
      if (!stmt) cache.set(query, (stmt = db.query(query)));
      // DO SqlStorage accepts ArrayBuffer blobs; bun:sqlite wants TypedArrays
      const args = bindings.map((b) => (b instanceof ArrayBuffer ? new Uint8Array(b) : b));
      const rows = stmt.all(...(args as any[])) as Record<string, unknown>[];
      return { toArray: () => rows };
    },
  };
}

export interface HarnessOptions {
  /** logical database name */
  dbName?: string;
  /** sqlite file path (default: in-memory) */
  file?: string;
  config?: Partial<TransactorConfig>;
  /** fault injection: throw inside the N-th (1-based) transactionSync */
  failWriteAt?: number;
  now?: () => number;
}

export class Harness implements TransactorHost {
  readonly dbName: string;
  readonly db: Database;
  readonly sql: SqlLike;
  readonly bucket: MemoryBucket;
  readonly config: TransactorConfig;
  readonly subscribers = new Set<FakeSocket>();
  alarm: number | null = null;
  aborted: string | undefined;
  writes = 0;
  private failAt: number | undefined;
  private clock: () => number;
  transactor: Transactor;

  constructor(opts: HarnessOptions = {}, bucket?: MemoryBucket) {
    this.dbName = opts.dbName ?? "test";
    this.db = new Database(opts.file ?? ":memory:");
    // file-backed: WAL + fsync on every commit (so group commit pays for real durability)
    this.db.exec(opts.file ? "PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;" : "PRAGMA synchronous = OFF;");
    this.sql = sqliteLike(this.db);
    this.bucket = bucket ?? new MemoryBucket();
    this.config = { ...DEFAULT_CONFIG, ...opts.config };
    this.failAt = opts.failWriteAt;
    this.clock = opts.now ?? (() => Date.now());
    this.transactor = new Transactor(this);
  }

  transactionSync<T>(fn: () => T): T {
    this.writes++;
    if (this.failAt !== undefined && this.writes === this.failAt) {
      // simulate a storage failure *before* anything lands (all-or-nothing)
      throw new Error("injected storage failure");
    }
    return this.db.transaction(fn)();
  }
  sockets(): SocketLike[] {
    return [...this.subscribers];
  }
  async getAlarm() {
    return this.alarm;
  }
  async setAlarm(time: number) {
    this.alarm = time;
  }
  abort(reason: string) {
    this.aborted = reason;
  }
  now() {
    return this.clock();
  }

  /** Subscribe a fake socket (hello + catch-up from `from`). */
  subscribe(from = 0): FakeSocket {
    const s = new FakeSocket();
    this.subscribers.add(s);
    this.transactor.onSubscribe(s, from);
    return s;
  }

  /** Simulate the DO being evicted/restarted: a fresh Transactor over the same durable state. */
  restart(opts: Omit<HarnessOptions, "file"> = {}): Harness {
    const h = new Harness({ ...opts, config: opts.config ?? this.config }, this.bucket);
    // share the SQLite database (same durable state) — reuse the same handle
    (h as any).db = this.db;
    (h as any).sql = this.sql;
    (h as any).transactor = new Transactor(h);
    return h;
  }

  /** Fire the pending alarm, if any. */
  async fireAlarm(): Promise<boolean> {
    if (this.alarm === null) return false;
    this.alarm = null;
    await this.transactor.onAlarm();
    return true;
  }

  /** All log ts in order. */
  logTs(): number[] {
    return this.sql.exec(`SELECT t FROM log ORDER BY t`).toArray().map((r) => r.t as number);
  }
}

export const attribute = (ident: string, type: string, extra: Record<string, unknown> = {}) => ({
  ":db/ident": ident,
  ":db/valueType": `:db.type/${type}`,
  ":db/cardinality": ":db.cardinality/one",
  ...extra,
});
