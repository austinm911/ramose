/**
 * Write WebSocket frame protocol (src/write-ws.ts):
 *   - decode: single tx, txs, ping, and every malformed shape (id or null)
 *   - handle: one reply per frame, ack shape, error shape (message + code)
 *   - txs: every transact issued in the same tick (one group commit), order preserved
 *   - end to end over a real Transactor (Harness): 8 txs in one frame = one batch, dense t
 */
import { describe, expect, test } from "bun:test";
import { TxError } from "@ripple/core";
import { FakeSocket, Harness, attribute } from "./harness.ts";
import { decodeWriteFrame, encodeWriteReply, handleWriteFrame, type WriteCore } from "../src/write-ws.ts";
import type { TxAck } from "../src/transactor.ts";

const ack = (t: number): TxAck => ({ t, txEid: 1000 + t, tempids: {}, datoms: 3 });

/** A transactor stand-in whose acks are resolved by the test, one deferred per call. */
function fakeCore() {
  const calls: unknown[][] = [];
  const deferred: { resolve: (a: TxAck) => void; reject: (e: unknown) => void }[] = [];
  const core: WriteCore = {
    t: 7,
    transact(tx) {
      calls.push(tx);
      return new Promise<TxAck>((resolve, reject) => deferred.push({ resolve, reject }));
    },
  };
  return { core, calls, deferred };
}

/** A transactor stand-in that answers immediately (`t` = 100 + index, or throws). */
function instantCore(fail?: (i: number) => unknown) {
  let i = 0;
  const core: WriteCore = {
    t: 1,
    async transact() {
      const n = i++;
      const err = fail?.(n);
      if (err) throw err;
      return ack(100 + n);
    },
  };
  return core;
}

describe("decodeWriteFrame", () => {
  test("single tx", () => {
    const f = decodeWriteFrame(JSON.stringify({ id: 3, tx: [{ ":k/v": "a" }] })) as { id: number; tx: unknown[] };
    expect(f.id).toBe(3);
    expect(f.tx).toEqual([{ ":k/v": "a" }]);
  });

  test("txs", () => {
    const f = decodeWriteFrame(JSON.stringify({ id: 4, txs: [[{ ":k/v": "a" }], [{ ":k/v": "b" }]] })) as { id: number; txs: unknown[][] };
    expect(f.id).toBe(4);
    expect(f.txs.length).toBe(2);
    expect(f.txs[1]).toEqual([{ ":k/v": "b" }]);
  });

  test("bodies go through fromJson (transport encodings)", () => {
    const f = decodeWriteFrame(JSON.stringify({ id: 1, tx: [{ ":k/at": { $inst: 1700000000000 } }] })) as { tx: any[] };
    expect(f.tx[0][":k/at"]).toBeInstanceOf(Date);
    expect((f.tx[0][":k/at"] as Date).getTime()).toBe(1700000000000);
  });

  test("ping", () => {
    expect(decodeWriteFrame(JSON.stringify({ kind: "ping" }))).toEqual({ kind: "ping" });
  });

  test("bad json → error with id null", () => {
    const f = decodeWriteFrame("{not json") as { id: null; error: string };
    expect(f.id).toBeNull();
    expect(f.error).toContain("invalid json");
  });

  test("non-object frame → error with id null", () => {
    expect(decodeWriteFrame("[1,2]")).toEqual({ id: null, error: "frame must be a JSON object" });
    expect(decodeWriteFrame("42")).toEqual({ id: null, error: "frame must be a JSON object" });
  });

  test("missing / non-numeric id → error with id null", () => {
    expect(decodeWriteFrame(JSON.stringify({ tx: [] }))).toEqual({ id: null, error: "frame must have a numeric id" });
    expect(decodeWriteFrame(JSON.stringify({ id: "3", tx: [] }))).toEqual({ id: null, error: "frame must have a numeric id" });
  });

  test("neither tx nor txs → error, id kept", () => {
    expect(decodeWriteFrame(JSON.stringify({ id: 9 }))).toEqual({ id: 9, error: "frame must have tx or txs" });
  });

  test("txs not an array / not arrays inside → error, id kept", () => {
    expect(decodeWriteFrame(JSON.stringify({ id: 9, txs: { a: 1 } }))).toEqual({ id: 9, error: "txs must be an array of transactions" });
    expect(decodeWriteFrame(JSON.stringify({ id: 9, txs: [[], "x"] }))).toEqual({ id: 9, error: "each entry of txs must be a transaction array" });
    expect(decodeWriteFrame(JSON.stringify({ id: 9, tx: "x" }))).toEqual({ id: 9, error: "tx must be a transaction array" });
  });
});

describe("encodeWriteReply", () => {
  test("toJson encoding, same as the HTTP ack", () => {
    expect(JSON.parse(encodeWriteReply({ id: 1, ...ack(5) }))).toEqual({ id: 1, t: 5, txEid: 1005, tempids: {}, datoms: 3 });
  });
});

describe("handleWriteFrame", () => {
  test("single tx → { id, ...ack }", async () => {
    const ws = new FakeSocket();
    await handleWriteFrame(instantCore(), ws, JSON.stringify({ id: 11, tx: [{ ":k/v": "a" }] }));
    expect(ws.frames).toEqual([{ id: 11, t: 100, txEid: 1100, tempids: {}, datoms: 3 }]);
  });

  test("single tx rejection → { id, error, code } (same shape as the HTTP path)", async () => {
    const ws = new FakeSocket();
    const core = instantCore(() => new TxError("unknown attribute :k/nope", "tx/unknown-attribute"));
    await handleWriteFrame(core, ws, JSON.stringify({ id: 12, tx: [[":db/add", "x", ":k/nope", 1]] }));
    expect(ws.frames).toEqual([{ id: 12, error: "unknown attribute :k/nope", code: "tx/unknown-attribute" }]);
  });

  test("txs: every transact is issued in the same tick, before any resolves", async () => {
    const ws = new FakeSocket();
    const { core, calls, deferred } = fakeCore();
    const txs = Array.from({ length: 8 }, (_, i) => [{ ":k/v": `v${i}` }]);
    const done = handleWriteFrame(core, ws, JSON.stringify({ id: 20, txs }));
    // no await yet: all 8 must already be queued on the transactor
    expect(calls.length).toBe(8);
    expect(ws.frames.length).toBe(0);
    // resolve out of order; the reply must still be in frame order
    deferred[3].resolve(ack(43));
    deferred[0].resolve(ack(40));
    deferred[7].resolve(ack(47));
    for (const [i, d] of deferred.entries()) if (![0, 3, 7].includes(i)) d.resolve(ack(40 + i));
    await done;
    expect(ws.frames.length).toBe(1);
    expect(ws.frames[0].id).toBe(20);
    expect(ws.frames[0].acks.map((a: TxAck) => a.t)).toEqual([40, 41, 42, 43, 44, 45, 46, 47]);
  });

  test("txs: one rejected tx becomes { error } in its slot; the others still ack", async () => {
    const ws = new FakeSocket();
    const core = instantCore((i) => (i === 1 ? new TxError("bad", "tx/invalid") : undefined));
    await handleWriteFrame(core, ws, JSON.stringify({ id: 21, txs: [[{ ":k/v": "a" }], [{ ":k/v": "b" }], [{ ":k/v": "c" }]] }));
    expect(ws.frames[0].acks).toEqual([
      { t: 100, txEid: 1100, tempids: {}, datoms: 3 },
      { error: "bad", code: "tx/invalid" },
      { t: 102, txEid: 1102, tempids: {}, datoms: 3 },
    ]);
  });

  test("txs: a synchronous throw from transact is caught too", async () => {
    const ws = new FakeSocket();
    const core: WriteCore = {
      transact() {
        throw new Error("boom");
      },
    };
    await handleWriteFrame(core, ws, JSON.stringify({ id: 22, txs: [[{ ":k/v": "a" }]] }));
    expect(ws.frames[0].acks).toEqual([{ error: "boom" }]);
  });

  test("frame errors reply exactly once, with id or null", async () => {
    const ws = new FakeSocket();
    await handleWriteFrame(instantCore(), ws, "{oops");
    await handleWriteFrame(instantCore(), ws, JSON.stringify({ id: 5 }));
    expect(ws.frames.length).toBe(2);
    expect(ws.frames[0].id).toBeNull();
    expect(ws.frames[0].error).toContain("invalid json");
    expect(ws.frames[1]).toEqual({ id: 5, error: "frame must have tx or txs" });
  });

  test("binary frames are ignored (no reply)", async () => {
    const ws = new FakeSocket();
    await handleWriteFrame(instantCore(), ws, new TextEncoder().encode("{}").buffer as ArrayBuffer);
    expect(ws.frames.length).toBe(0);
  });

  test("ping → pong with the current t", async () => {
    const ws = new FakeSocket();
    await handleWriteFrame(instantCore(), ws, JSON.stringify({ kind: "ping" }));
    expect(ws.frames).toEqual([{ kind: "pong", t: 1 }]);
  });

  test("a closed socket never throws out of the handler", async () => {
    const ws = new FakeSocket();
    ws.close();
    await handleWriteFrame(instantCore(), ws, JSON.stringify({ id: 1, tx: [{ ":k/v": "a" }] }));
    expect(ws.frames.length).toBe(0);
  });
});

describe("handleWriteFrame over a real Transactor", () => {
  test("a txs frame of 8 is one group commit with dense t", async () => {
    const h = new Harness();
    await h.transactor.init();
    await h.transactor.transact([attribute(":k/id", "long", { ":db/unique": ":db.unique/identity" }), attribute(":k/v", "string")]);
    const t0 = h.transactor.t;
    const batchesBefore = h.transactor.stats.batches;
    const writesBefore = h.writes;

    const ws = new FakeSocket();
    const txs = Array.from({ length: 8 }, (_, i) => [{ ":k/id": i, ":k/v": `v${i}` }]);
    await handleWriteFrame(h.transactor, ws, JSON.stringify({ id: 1, txs }));

    expect(ws.frames.length).toBe(1);
    const acks = ws.frames[0].acks as TxAck[];
    expect(acks.length).toBe(8);
    expect(acks.map((a) => a.t)).toEqual(Array.from({ length: 8 }, (_, i) => t0 + 1 + i)); // dense, in order
    expect(h.transactor.stats.batches - batchesBefore).toBe(1); // ONE batch
    expect(h.writes - writesBefore).toBe(1); // ONE storage write
    expect(h.transactor.stats.maxBatch).toBe(8);
    expect(h.logTs()).toEqual(Array.from({ length: t0 + 8 }, (_, i) => i + 1));
  });

  test("a single-tx frame acks with the committed t", async () => {
    const h = new Harness();
    await h.transactor.init();
    await h.transactor.transact([attribute(":k/v", "string")]);
    const ws = new FakeSocket();
    await handleWriteFrame(h.transactor, ws, JSON.stringify({ id: 2, tx: [{ ":k/v": "a" }] }));
    expect(ws.frames[0].id).toBe(2);
    expect(ws.frames[0].t).toBe(h.transactor.t);
  });

  test("a rejected tx over the socket carries the transactor's code", async () => {
    const h = new Harness();
    await h.transactor.init();
    const ws = new FakeSocket();
    await handleWriteFrame(h.transactor, ws, JSON.stringify({ id: 3, tx: [[":db/add", "x", ":k/nope", 1]] }));
    expect(ws.frames[0].id).toBe(3);
    expect(typeof ws.frames[0].error).toBe("string");
    expect(typeof ws.frames[0].code).toBe("string");
  });
});
