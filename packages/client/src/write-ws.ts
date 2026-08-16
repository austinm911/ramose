/**
 * Client-held write WebSocket (protocol v1).
 *
 *   const sock = ripple.db("app").writeSocket();
 *   await sock.ready;
 *   const ack = await sock.transact([{ ":user/name": "Ada" }]);
 *   const acks = await sock.transactMany([tx1, tx2, tx3]);   // one frame, one round trip
 *   sock.close();
 *
 * `acks.t` is the frame's basis — pass it as `db.q(..., { minT })` / `db.query(..., { minT })`
 * or `db.asOf(t)` when a read must observe these writes.
 *
 * One socket = one Worker request = one Transactor DO socket. The fetch-based
 * `RippleDb.transact` is unchanged; this is the batching/pipelining path.
 *
 * Wire format (JSON text frames, `toJson`/`fromJson` encoded exactly like the
 * HTTP bodies):
 *   client→server  { id, tx }               | { id, txs: TxData[] }
 *   server→client  { id, t, txEid, tempids, datoms }
 *                | { id, t?, acks: Array<TxAck | { error, code? }> }     (same order as txs)
 *                | { id: number | null, error, code?, status? }
 * Anything else (e.g. an unsolicited `{ kind: "pong", t }`) and any frame whose
 * `id` has no pending caller is ignored.
 */

import { fromJson, toJson } from "@ripple/core";
import type { TxData } from "@ripple/core";
import { RippleError } from "./errors.ts";
import type { RippleClient, TxAck } from "./index.ts";

// ---------------------------------------------------------------- codec

export type WriteFrame = { id: number; tx: TxData } | { id: number; txs: TxData[] };

/** Per-slot failure inside a multi-tx reply. */
export interface SlotError {
  error: string;
  code?: string;
}

export type WriteReply =
  | { kind: "ack"; id: number; ack: TxAck }
  | { kind: "acks"; id: number; t?: number; acks: Array<TxAck | SlotError> }
  | { kind: "error"; id: number | null; error: string; code?: string; status?: number }
  /** Unparseable, or parseable but not one of the three shapes (pong, future frames). */
  | { kind: "unknown"; frame?: unknown; text: string };

/** `transactMany` result: the slot acks plus the frame's basis `t` (non-enumerable). */
export type TxAcks = TxAck[] & { readonly t: number };

/**
 * `JSON.stringify(toJson(frame))` — one tx (`{ id, tx }`) or a batch (`{ id, txs }`).
 * `TxData` is itself `unknown[]`, so a batch cannot be sniffed: pass `many = true`.
 */
export function encodeWriteFrame(id: number, tx: TxData): string;
export function encodeWriteFrame(id: number, txs: TxData[], many: true): string;
export function encodeWriteFrame(id: number, txOrTxs: TxData | TxData[], many = false): string {
  const frame: WriteFrame = many ? { id, txs: txOrTxs as TxData[] } : { id, tx: txOrTxs as TxData };
  return JSON.stringify(toJson(frame));
}

/** `fromJson(JSON.parse(text))`, classified. Never throws. */
export function decodeWriteReply(text: string): WriteReply {
  let frame: unknown;
  try {
    frame = fromJson(JSON.parse(text));
  } catch {
    return { kind: "unknown", text };
  }
  if (frame === null || typeof frame !== "object" || Array.isArray(frame)) return { kind: "unknown", frame, text };
  const o = frame as Record<string, unknown>;
  const id = typeof o.id === "number" ? o.id : null;
  if (typeof o.error === "string") {
    const out: WriteReply = { kind: "error", id, error: o.error };
    if (typeof o.code === "string") out.code = o.code;
    if (typeof o.status === "number") out.status = o.status;
    return out;
  }
  if (id === null) return { kind: "unknown", frame, text };
  if (Array.isArray(o.acks)) {
    const out: Extract<WriteReply, { kind: "acks" }> = { kind: "acks", id, acks: o.acks as Array<TxAck | SlotError> };
    if (typeof o.t === "number") out.t = o.t;
    return out;
  }
  if (typeof o.t === "number") return { kind: "ack", id, ack: { t: o.t, txEid: Number(o.txEid), tempids: (o.tempids as Record<string, number>) ?? {}, datoms: Number(o.datoms) } };
  return { kind: "unknown", frame, text };
}

/** Build `ws(s)://…/db/<name>/write-ws[?token=…]` from an http(s) client base. */
export function writeSocketUrl(base: string, name: string, token?: string): string {
  const root = base.replace(/\/+$/, "").replace(/^http(s?):\/\//, "ws$1://");
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${root}/db/${encodeURIComponent(name)}/write-ws${q}`;
}

// ---------------------------------------------------------------- socket

/** The slice of the WebSocket API this client uses (so tests can inject a stub). */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (ev: any) => void): void;
}

export type WebSocketCtor = new (url: string, protocolsOrOptions?: any) => WebSocketLike;

export interface WriteSocketOptions {
  /** Injectable WebSocket implementation (tests, non-global runtimes). Defaults to `globalThis.WebSocket`. */
  WebSocket?: WebSocketCtor;
}

interface Pending {
  multi: boolean;
  resolve: (v: any) => void;
  reject: (e: unknown) => void;
}

export class RippleWriteSocket {
  readonly url: string;
  /** Resolves when the socket is open; rejects if it errors or closes first. */
  readonly ready: Promise<void>;
  private readonly ws: WebSocketLike;
  private readonly inflight = new Map<number, Pending>();
  private nextId = 0;
  private opened = false;
  private closed = false;

  constructor(client: RippleClient, readonly name: string, opts: WriteSocketOptions = {}) {
    const token = client.opts.token;
    this.url = writeSocketUrl(client.base, name, token);
    const Ctor = opts.WebSocket ?? ((globalThis as { WebSocket?: WebSocketCtor }).WebSocket as WebSocketCtor | undefined);
    if (!Ctor) throw new RippleError("ripple: no WebSocket implementation (pass opts.WebSocket)", 0);

    // `?token=` is enough for the server everywhere; Bun also honours a headers
    // option, browsers would treat the 2nd arg as subprotocols — so only on Bun.
    const bunHeaders = token && typeof (globalThis as { Bun?: unknown }).Bun !== "undefined" ? { headers: { authorization: `Bearer ${token}` } } : undefined;
    this.ws = bunHeaders ? new Ctor(this.url, bunHeaders) : new Ctor(this.url);

    this.ready = new Promise<void>((resolve, reject) => {
      this.ws.addEventListener("open", () => {
        this.opened = true;
        resolve();
      });
      this.ws.addEventListener("error", (ev: any) => {
        const err = new RippleError(`ripple: write socket error (${this.url})${ev?.message ? `: ${ev.message}` : ""}`, 0);
        if (!this.opened) reject(err);
        this.failAll(err);
      });
      this.ws.addEventListener("close", (ev: any) => {
        this.closed = true;
        const err = new RippleError(`ripple: write socket closed${ev?.code !== undefined ? ` (${ev.code}${ev?.reason ? ` ${ev.reason}` : ""})` : ""}`, 0);
        if (!this.opened) reject(err);
        this.failAll(err);
      });
    });
    // Never surface an unhandled rejection for callers that only await transact().
    this.ready.catch(() => {});

    this.ws.addEventListener("message", (ev: any) => this.onMessage(ev?.data));
  }

  /** In-flight frames (bench/backpressure). */
  get pending(): number {
    return this.inflight.size;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** One tx per frame; resolves with the transactor's ack. */
  async transact(tx: TxData): Promise<TxAck> {
    return this.send<TxAck>(false, (id) => encodeWriteFrame(id, tx));
  }

  /**
   * N txs in one frame — one round trip, one ack array, in order.
   *
   * Resolves with every ack when all slots succeeded. If any slot carries an
   * `error` the whole call rejects with a `RippleError` naming the first failing
   * index (`ripple: tx 2 of 8 failed: …`); the raw slot array is attached to the
   * error as `.acks` for callers that need the partial results.
   */
  async transactMany(txs: TxData[]): Promise<TxAcks> {
    if (txs.length === 0) {
      const empty = [] as unknown as TxAcks;
      Object.defineProperty(empty, "t", { value: 0, enumerable: false });
      return empty;
    }
    const { acks, t } = await this.send<{ acks: Array<TxAck | SlotError>; t?: number }>(true, (id) => encodeWriteFrame(id, txs, true));
    const bad = acks.findIndex((a) => a && typeof (a as SlotError).error === "string");
    if (bad >= 0) {
      const slot = acks[bad] as SlotError;
      const err = new RippleError(`ripple: tx ${bad} of ${txs.length} failed: ${slot.error}`, 0, slot.code);
      (err as RippleError & { acks?: unknown }).acks = acks;
      throw err;
    }
    const basis = t ?? Math.max(...(acks as TxAck[]).map((a) => a.t));
    Object.defineProperty(acks, "t", { value: basis, enumerable: false });
    return acks as TxAcks;
  }

  /** Close the socket and reject everything still in flight. */
  close(code?: number, reason?: string): void {
    this.closed = true;
    try {
      this.ws.close(code, reason);
    } catch {
      /* already closing */
    }
    this.failAll(new RippleError("ripple: write socket closed", 0));
  }

  private async send<T>(multi: boolean, encode: (id: number) => string): Promise<T> {
    if (this.closed) throw new RippleError("ripple: write socket closed", 0);
    await this.ready;
    if (this.closed) throw new RippleError("ripple: write socket closed", 0);
    const id = ++this.nextId;
    const p = new Promise<T>((resolve, reject) => this.inflight.set(id, { multi, resolve, reject }));
    try {
      this.ws.send(encode(id));
    } catch (e) {
      this.inflight.delete(id);
      throw new RippleError(`ripple: write socket send failed: ${e instanceof Error ? e.message : String(e)}`, 0);
    }
    return p;
  }

  private onMessage(data: unknown): void {
    const text = typeof data === "string" ? data : data instanceof Uint8Array ? new TextDecoder().decode(data) : data instanceof ArrayBuffer ? new TextDecoder().decode(new Uint8Array(data)) : String(data);
    const reply = decodeWriteReply(text);
    if (reply.kind === "unknown") return; // pong / garbage / future frames
    if (reply.id === null) return; // connection-level error with no caller
    const p = this.inflight.get(reply.id);
    if (!p) return; // late or unknown id
    this.inflight.delete(reply.id);
    if (reply.kind === "error") {
      p.reject(new RippleError(reply.error, reply.status ?? 0, reply.code));
      return;
    }
    if (reply.kind === "acks") {
      if (!p.multi) {
        p.reject(new RippleError(`ripple: expected a single ack for frame ${reply.id}, got ${reply.acks.length} acks`, 0));
        return;
      }
      p.resolve({ acks: reply.acks, t: reply.t });
      return;
    }
    if (p.multi) {
      p.reject(new RippleError(`ripple: expected an ack array for frame ${reply.id}, got a single ack`, 0));
      return;
    }
    p.resolve(reply.ack);
  }

  private failAll(err: RippleError): void {
    if (this.inflight.size === 0) return;
    const pendings = [...this.inflight.values()];
    this.inflight.clear();
    for (const p of pendings) p.reject(err);
  }
}
