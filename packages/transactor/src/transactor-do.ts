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
import { toJson } from "@ripple/core";
import { type RippleEnv, envInt } from "./env.ts";
import { DEFAULT_CONFIG, type SocketLike, type TransactorConfig, type TransactorHost } from "./host.ts";
import { Transactor, type TxAck } from "./transactor.ts";

export type { TxAck };

export function configFromEnv(env: RippleEnv): TransactorConfig {
  return {
    ...DEFAULT_CONFIG,
    indexIntervalMs: envInt(env.RIPPLE_INDEX_INTERVAL_MS, DEFAULT_CONFIG.indexIntervalMs),
    indexTxThreshold: envInt(env.RIPPLE_INDEX_TX_THRESHOLD, DEFAULT_CONFIG.indexTxThreshold),
    indexMaxTxsPerRun: envInt(env.RIPPLE_INDEX_MAX_TXS_PER_RUN, DEFAULT_CONFIG.indexMaxTxsPerRun),
    logKeepTxs: envInt(env.RIPPLE_LOG_KEEP_TXS, DEFAULT_CONFIG.logKeepTxs),
    gcEveryNIndexes: envInt(env.RIPPLE_GC_EVERY_N_INDEXES, DEFAULT_CONFIG.gcEveryNIndexes),
    retainRoots: envInt(env.RIPPLE_RETAIN_ROOTS, DEFAULT_CONFIG.retainRoots),
    maxBatch: envInt(env.RIPPLE_MAX_BATCH, DEFAULT_CONFIG.maxBatch),
  };
}

export class TransactorDO extends DurableObject<RippleEnv> {
  private readonly core: Transactor;

  constructor(ctx: DurableObjectState, env: RippleEnv) {
    super(ctx, env);
    const host: TransactorHost = {
      sql: ctx.storage.sql,
      transactionSync: (fn) => ctx.storage.transactionSync(fn),
      bucket: env.STORE,
      sockets: () => ctx.getWebSockets() as unknown as SocketLike[],
      getAlarm: () => ctx.storage.getAlarm(),
      setAlarm: (time) => ctx.storage.setAlarm(time),
      abort: (reason) => ctx.abort(reason),
      now: () => Date.now(),
      config: configFromEnv(env),
    };
    this.core = new Transactor(host);
  }

  /** In-process access for other code running in the same isolate (tests, worker). */
  get transactor(): Transactor {
    return this.core;
  }

  transact(tx: unknown[]): Promise<TxAck> {
    return this.core.init().then(() => this.core.transact(tx));
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.core.init();
    this.core.onSocketMessage(ws, message);
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code, "bye");
    } catch {}
  }

  override async alarm(): Promise<void> {
    await this.core.onAlarm();
  }

  override async fetch(request: Request): Promise<Response> {
    await this.core.init();
    const url = new URL(request.url);
    if (url.pathname === "/subscribe") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
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
