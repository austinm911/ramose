/**
 * Write WebSocket frame protocol (v1) — the client-held write socket.
 *
 * Shape: client --WS--> Worker request --stub.fetch(Upgrade)--> Transactor DO.
 * The DO shell (transactor-do.ts) accepts the socket with the standard
 * `server.accept()` (deliberately NOT `ctx.acceptWebSocket`, which would put it
 * in `ctx.getWebSockets()` = `host.sockets()` and feed it the replica novelty
 * broadcast) and forwards every frame here. Everything in this file is
 * runtime-agnostic and plain async/await — no Effect, no cloudflare:workers —
 * so it is unit-tested under Bun.
 *
 * JSON text frames only (binary frames are ignored):
 *
 *   client → DO   { "id": <number>, "tx":  TxData    }
 *                 { "id": <number>, "txs": TxData[]  }   one group-commit batch
 *                 { "kind": "ping" }                     (optional keepalive)
 *
 *   DO → client   { "id", "t", "txEid", "tempids", "datoms" }        single ack
 *                 { "id", "t"?, "acks": Array<TxAck | { error, code? }> }  multi, in order
 *                 { "id": <id|null>, "error", "code"? }              frame / tx failure
 *                 { "kind": "pong", "t" }
 *
 * Consistency: an ack's `t` is the basis of that write; pass it as `minT`/`asOf`
 * on a later read. Nothing is invalidated per frame. The multi reply's top-level
 * `t` = max `t` over successful slots (omitted when none succeeded).
 *
 * Exactly one reply per frame. Bodies go through `fromJson`/`toJson`, the same
 * encoding the HTTP `/transact` route uses. For `txs` every `core.transact()`
 * is issued synchronously in one tick before anything is awaited, so the whole
 * frame lands in a single group-commit batch.
 */

import { type TxData, fromJson, toJson } from "@ripple/core";
import { toHttpError } from "./errors.ts";
import type { SocketLike } from "./host.ts";
import type { TxAck } from "./transactor.ts";

/** What `handleWriteFrame` needs from a `Transactor` (structurally satisfied by it). */
export interface WriteCore {
  transact(tx: TxData): Promise<TxAck>;
  /** current basis, used only for `pong` frames */
  readonly t?: number;
}

/** Error body of a rejected frame or of one tx inside a `txs` frame. */
export interface WriteErrorBody {
  error: string;
  code?: string;
}

export type DecodedWriteFrame =
  | { kind: "ping" }
  | { id: number; tx?: TxData; txs?: TxData[] }
  | { id: number | null; error: string };

export type WriteReply =
  | ({ id: number } & TxAck)
  | { id: number; t?: number; acks: (TxAck | WriteErrorBody)[] }
  | ({ id: number | null } & WriteErrorBody)
  | { kind: "pong"; t: number };

const frameBasis = (acks: (TxAck | WriteErrorBody)[]): number | undefined =>
  acks.reduce<number | undefined>((m, a) => ("t" in a && typeof a.t === "number" ? Math.max(m ?? a.t, a.t) : m), undefined);

const isError = (f: DecodedWriteFrame): f is { id: number | null; error: string } => "error" in f;
const isPing = (f: DecodedWriteFrame): f is { kind: "ping" } => "kind" in f && f.kind === "ping";

/** Parse one text frame. Pure: never touches the transactor or the socket. */
export function decodeWriteFrame(text: string): DecodedWriteFrame {
  let raw: unknown;
  try {
    raw = fromJson(JSON.parse(text));
  } catch (err) {
    return { id: null, error: `invalid json: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { id: null, error: "frame must be a JSON object" };
  const o = raw as Record<string, unknown>;
  if (o.kind === "ping") return { kind: "ping" };
  const id = o.id;
  if (typeof id !== "number" || !Number.isFinite(id)) return { id: null, error: "frame must have a numeric id" };
  if (o.txs !== undefined) {
    if (!Array.isArray(o.txs)) return { id, error: "txs must be an array of transactions" };
    for (const tx of o.txs) if (!Array.isArray(tx)) return { id, error: "each entry of txs must be a transaction array" };
    return { id, txs: o.txs as TxData[] };
  }
  if (o.tx !== undefined) {
    if (!Array.isArray(o.tx)) return { id, error: "tx must be a transaction array" };
    return { id, tx: o.tx as TxData };
  }
  return { id, error: "frame must have tx or txs" };
}

/** Reply → wire text (same `toJson` encoding as the HTTP `/transact` reply). */
export function encodeWriteReply(reply: WriteReply): string {
  return JSON.stringify(toJson(reply));
}

/** A rejection, in the message/code the HTTP path would have returned (errors.ts). */
export function writeErrorBody(err: unknown): WriteErrorBody {
  const e = toHttpError(err);
  return e._tag === "TxRejected" ? { error: e.message, code: e.code } : { error: e.message };
}

const send = (ws: SocketLike, reply: WriteReply): void => {
  try {
    ws.send(encodeWriteReply(reply));
  } catch {
    // socket already closed; the frame is dropped
  }
};

/**
 * Handle one inbound frame and send exactly one reply.
 *
 * Binary frames are ignored (no reply). Never throws: a rejected transaction
 * becomes an `{ error }` reply, a broken socket is swallowed.
 */
export async function handleWriteFrame(core: WriteCore, ws: SocketLike, message: string | ArrayBuffer): Promise<void> {
  if (typeof message !== "string") return;
  const frame = decodeWriteFrame(message);
  if (isPing(frame)) {
    send(ws, { kind: "pong", t: core.t ?? 0 });
    return;
  }
  if (isError(frame)) {
    send(ws, { id: frame.id, error: frame.error });
    return;
  }
  if (frame.txs !== undefined) {
    // Issue every transact in this tick (no await in between) so the whole
    // frame is coalesced into one group commit; order is preserved in `acks`.
    const pending = frame.txs.map((tx) => {
      try {
        return core.transact(tx);
      } catch (err) {
        return Promise.reject(err);
      }
    });
    const tWait = performance.now();
    const settled = await Promise.allSettled(pending);
    const waitMs = performance.now() - tWait;
    if (waitMs > 2000) console.warn(`write-ws: allSettled ${waitMs.toFixed(0)}ms id=${frame.id} n=${pending.length}`);
    const acks = settled.map((r) => (r.status === "fulfilled" ? r.value : writeErrorBody(r.reason)));
    const t = frameBasis(acks);
    send(ws, t === undefined ? { id: frame.id, acks } : { id: frame.id, t, acks });
    return;
  }
  if (frame.tx !== undefined) {
    try {
      const ack = await core.transact(frame.tx);
      send(ws, { id: frame.id, ...ack });
    } catch (err) {
      send(ws, { id: frame.id, ...writeErrorBody(err) });
    }
    return;
  }
  send(ws, { id: frame.id, error: "frame must have tx or txs" });
}
