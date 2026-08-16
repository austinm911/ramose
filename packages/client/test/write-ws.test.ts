import { describe, expect, test } from "bun:test";
import { fromJson } from "@ripple/core";
import { RippleClient } from "../src/index.ts";
import { RippleError } from "../src/errors.ts";
import { type WebSocketLike, decodeWriteReply, encodeWriteFrame, writeSocketUrl } from "../src/write-ws.ts";

// ---------------------------------------------------------------- fake socket

class FakeSocket implements WebSocketLike {
  static last: FakeSocket | undefined;
  readyState = 0;
  readonly sent: string[] = [];
  readonly listeners = new Map<string, Array<(ev: any) => void>>();
  constructor(readonly url: string, readonly options?: any) {
    FakeSocket.last = this;
  }
  addEventListener(type: string, fn: (ev: any) => void) {
    const l = this.listeners.get(type) ?? [];
    l.push(fn);
    this.listeners.set(type, l);
  }
  private emit(type: string, ev: any) {
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }
  send(data: string) {
    if (this.readyState !== 1) throw new Error("not open");
    this.sent.push(data);
  }
  close(code?: number, reason?: string) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close", { code: code ?? 1000, reason });
  }
  /** test drivers */
  open() {
    this.readyState = 1;
    this.emit("open", {});
  }
  reply(frame: unknown) {
    this.emit("message", { data: JSON.stringify(frame) });
  }
  replyText(text: string) {
    this.emit("message", { data: text });
  }
  fail(message = "boom") {
    this.emit("error", { message });
  }
  /** the last frame this socket sent, parsed */
  lastFrame(): any {
    return JSON.parse(this.sent[this.sent.length - 1]!);
  }
}

const ack = (id: number, t: number) => ({ id, t, txEid: 1000 + t, tempids: {}, datoms: 2 });

function socket(opts: { token?: string; name?: string; base?: string } = {}) {
  const client = new RippleClient(opts.base ?? "https://ripple.example.com", opts.token ? { token: opts.token } : {});
  const sock = client.db(opts.name ?? "app").writeSocket({ WebSocket: FakeSocket as any });
  return { sock, ws: FakeSocket.last! };
}

// ---------------------------------------------------------------- codec

describe("encodeWriteFrame", () => {
  test("single tx round-trips through toJson/fromJson", () => {
    const text = encodeWriteFrame(7, [{ ":k/id": 1, ":k/v": "x" }]);
    expect(JSON.parse(text)).toEqual({ id: 7, tx: [{ ":k/id": 1, ":k/v": "x" }] });
    const back = fromJson(JSON.parse(text)) as any;
    expect(back.tx[0][":k/v"]).toBe("x");
  });

  test("txs batch keeps order and shape", () => {
    const text = encodeWriteFrame(2, [[{ ":k/id": 1 }], [{ ":k/id": 2 }]], true);
    expect(JSON.parse(text)).toEqual({ id: 2, txs: [[{ ":k/id": 1 }], [{ ":k/id": 2 }]] });
  });

  test("instant values survive toJson → JSON → fromJson", () => {
    const when = new Date("2024-03-04T05:06:07.008Z");
    const text = encodeWriteFrame(1, [{ ":e/at": when }]);
    expect(JSON.parse(text)).toEqual({ id: 1, tx: [{ ":e/at": { $inst: when.getTime() } }] });
    const back = fromJson(JSON.parse(text)) as any;
    expect(back.tx[0][":e/at"]).toBeInstanceOf(Date);
    expect((back.tx[0][":e/at"] as Date).getTime()).toBe(when.getTime());
  });

  test("bytes survive the batch encoding too", () => {
    const text = encodeWriteFrame(3, [[{ ":e/blob": new Uint8Array([1, 2, 3]) }]], true);
    const back = fromJson(JSON.parse(text)) as any;
    expect([...(back.txs[0][0][":e/blob"] as Uint8Array)]).toEqual([1, 2, 3]);
  });
});

describe("decodeWriteReply", () => {
  test("single ack", () => {
    const r = decodeWriteReply(JSON.stringify({ id: 4, t: 12, txEid: 90, tempids: { a: 5 }, datoms: 3 }));
    expect(r).toEqual({ kind: "ack", id: 4, ack: { t: 12, txEid: 90, tempids: { a: 5 }, datoms: 3 } });
  });

  test("multi acks, per-slot error preserved", () => {
    const r = decodeWriteReply(JSON.stringify({ id: 5, t: 12, acks: [{ t: 1, txEid: 2, tempids: {}, datoms: 1 }, { error: "nope", code: "conflict" }] }));
    expect(r.kind).toBe("acks");
    if (r.kind !== "acks") throw new Error("kind");
    expect(r.id).toBe(5);
    expect(r.t).toBe(12);
    expect(r.acks.length).toBe(2);
    expect((r.acks[1] as any).error).toBe("nope");
  });

  test("error frame with and without an id", () => {
    const a = decodeWriteReply(JSON.stringify({ id: 9, error: "bad tx", code: "invalid", status: 400 }));
    expect(a).toEqual({ kind: "error", id: 9, error: "bad tx", code: "invalid", status: 400 });
    const b = decodeWriteReply(JSON.stringify({ id: null, error: "unauthorized", status: 401 }));
    expect(b).toEqual({ kind: "error", id: null, error: "unauthorized", status: 401 });
  });

  test("pong, unknown shapes and garbage are `unknown`", () => {
    expect(decodeWriteReply(JSON.stringify({ kind: "pong", t: 5 })).kind).toBe("unknown");
    expect(decodeWriteReply("not json at all").kind).toBe("unknown");
    expect(decodeWriteReply("[1,2,3]").kind).toBe("unknown");
    expect(decodeWriteReply(JSON.stringify({ id: 3 })).kind).toBe("unknown");
    expect(decodeWriteReply("").kind).toBe("unknown");
  });

  test("instants inside a reply are decoded", () => {
    const r = decodeWriteReply(JSON.stringify({ id: 1, acks: [{ t: 1, at: { $inst: 1700000000000 } }] }));
    if (r.kind !== "acks") throw new Error("kind");
    expect((r.acks[0] as any).at).toBeInstanceOf(Date);
  });
});

describe("writeSocketUrl", () => {
  test("http → ws, https → wss, name encoded, token in the query", () => {
    expect(writeSocketUrl("http://localhost:8787", "app")).toBe("ws://localhost:8787/db/app/write-ws");
    expect(writeSocketUrl("https://x.workers.dev/", "app", "s3cret")).toBe("wss://x.workers.dev/db/app/write-ws?token=s3cret");
    expect(writeSocketUrl("https://x.workers.dev", "a b", "a/b")).toBe("wss://x.workers.dev/db/a%20b/write-ws?token=a%2Fb");
  });
});

// ---------------------------------------------------------------- socket

describe("RippleWriteSocket", () => {
  test("URL is /db/<name>/write-ws and carries ?token= when set", () => {
    const a = socket({ base: "http://localhost:8787", name: "bench-1" });
    expect(a.ws.url).toBe("ws://localhost:8787/db/bench-1/write-ws");
    expect(a.sock.url).toBe(a.ws.url);
    const b = socket({ base: "https://ripple.example.com", name: "app", token: "tok" });
    expect(b.ws.url).toBe("wss://ripple.example.com/db/app/write-ws?token=tok");
  });

  test("on Bun the constructor also gets an authorization header option", () => {
    const { ws } = socket({ token: "tok" });
    // this suite runs under Bun, so the headers option must be present
    expect(ws.options).toEqual({ headers: { authorization: "Bearer tok" } });
    const anon = socket({});
    expect(anon.ws.options).toBeUndefined();
  });

  test("ready resolves on open; transact sends { id, tx } and resolves with the ack", async () => {
    const { sock, ws } = socket({});
    ws.open();
    await sock.ready;
    const p = sock.transact([{ ":k/id": 1 }]);
    await Promise.resolve();
    expect(ws.lastFrame()).toEqual({ id: 1, tx: [{ ":k/id": 1 }] });
    expect(sock.pending).toBe(1);
    ws.reply(ack(1, 42));
    expect(await p).toEqual({ t: 42, txEid: 1042, tempids: {}, datoms: 2 });
    expect(sock.pending).toBe(0);
  });

  test("transact awaits ready by itself (send before open)", async () => {
    const { sock, ws } = socket({});
    const p = sock.transact([{ ":k/id": 1 }]);
    ws.open();
    await Promise.resolve();
    await Promise.resolve();
    expect(ws.sent.length).toBe(1);
    ws.reply(ack(1, 7));
    expect((await p).t).toBe(7);
  });

  test("out-of-order replies resolve the right ids", async () => {
    const { sock, ws } = socket({});
    ws.open();
    await sock.ready;
    const a = sock.transact([{ ":k/id": 1 }]);
    const b = sock.transact([{ ":k/id": 2 }]);
    const c = sock.transact([{ ":k/id": 3 }]);
    await Promise.resolve();
    expect(ws.sent.map((s) => JSON.parse(s).id)).toEqual([1, 2, 3]);
    expect(sock.pending).toBe(3);
    ws.reply(ack(3, 33));
    ws.reply(ack(1, 11));
    ws.reply(ack(2, 22));
    expect((await a).t).toBe(11);
    expect((await b).t).toBe(22);
    expect((await c).t).toBe(33);
    expect(sock.pending).toBe(0);
  });

  test("transactMany sends one { id, txs } frame and returns acks in order", async () => {
    const { sock, ws } = socket({});
    ws.open();
    await sock.ready;
    const txs = [[{ ":k/id": 1 }], [{ ":k/id": 2 }], [{ ":k/id": 3 }]];
    const p = sock.transactMany(txs);
    await Promise.resolve();
    expect(ws.lastFrame()).toEqual({ id: 1, txs });
    ws.reply({ id: 1, acks: [ack(0, 10), ack(0, 11), ack(0, 12)].map(({ id: _id, ...a }) => a) });
    const acks = await p;
    expect(acks.map((a) => a.t)).toEqual([10, 11, 12]);
    expect(acks.t).toBe(12);
  });

  test("transactMany uses the reply's top-level t as acks.t", async () => {
    const { sock, ws } = socket({});
    ws.open();
    await sock.ready;
    const p = sock.transactMany([[{ ":k/id": 1 }], [{ ":k/id": 2 }]]);
    await Promise.resolve();
    ws.reply({ id: 1, t: 12, acks: [{ t: 10, txEid: 1010, tempids: {}, datoms: 2 }, { t: 11, txEid: 1011, tempids: {}, datoms: 2 }] });
    expect((await p).t).toBe(12);
  });

  test("transactMany rejects naming the failing slot and keeps the raw acks", async () => {
    const { sock, ws } = socket({});
    ws.open();
    await sock.ready;
    const p = sock.transactMany([[{ ":k/id": 1 }], [{ ":k/id": 2 }]]);
    await Promise.resolve();
    ws.reply({ id: 1, acks: [{ t: 1, txEid: 2, tempids: {}, datoms: 1 }, { error: ":k/id conflict", code: "conflict" }] });
    const err = (await p.catch((e) => e)) as RippleError & { acks: unknown[] };
    expect(err).toBeInstanceOf(RippleError);
    expect(err.message).toBe("ripple: tx 1 of 2 failed: :k/id conflict");
    expect(err.code).toBe("conflict");
    expect(err.acks.length).toBe(2);
  });

  test("empty transactMany resolves without touching the wire", async () => {
    const { sock, ws } = socket({});
    ws.open();
    await sock.ready;
    const empty = await sock.transactMany([]);
    expect(empty.length).toBe(0);
    expect(empty.t).toBe(0);
    expect(ws.sent.length).toBe(0);
  });

  test("error frame rejects only that id", async () => {
    const { sock, ws } = socket({});
    ws.open();
    await sock.ready;
    const a = sock.transact([{ ":k/id": 1 }]);
    const b = sock.transact([{ ":k/id": 2 }]);
    await Promise.resolve();
    ws.reply({ id: 1, error: "unique conflict", code: "conflict", status: 409 });
    const err = (await a.catch((e) => e)) as RippleError;
    expect(err).toBeInstanceOf(RippleError);
    expect(err.message).toBe("unique conflict");
    expect(err.status).toBe(409);
    expect(err.code).toBe("conflict");
    expect(sock.pending).toBe(1);
    ws.reply(ack(2, 5));
    expect((await b).t).toBe(5);
  });

  test("frames with no matching id (pong, stale ack, id-less error) are ignored", async () => {
    const { sock, ws } = socket({});
    ws.open();
    await sock.ready;
    const p = sock.transact([{ ":k/id": 1 }]);
    await Promise.resolve();
    ws.reply({ kind: "pong", t: 3 });
    ws.reply(ack(99, 4));
    ws.reply({ id: null, error: "connection level" });
    ws.replyText("}{ garbage");
    expect(sock.pending).toBe(1);
    ws.reply(ack(1, 8));
    expect((await p).t).toBe(8);
  });

  test("a single ack for a txs frame (and vice versa) rejects that call", async () => {
    const { sock, ws } = socket({});
    ws.open();
    await sock.ready;
    const many = sock.transactMany([[{ ":k/id": 1 }]]);
    await Promise.resolve();
    ws.reply(ack(1, 3));
    expect(((await many.catch((e) => e)) as Error).message).toContain("expected an ack array");
    const one = sock.transact([{ ":k/id": 2 }]);
    await Promise.resolve();
    ws.reply({ id: 2, acks: [{ t: 1, txEid: 2, tempids: {}, datoms: 1 }] });
    expect(((await one.catch((e) => e)) as Error).message).toContain("expected a single ack");
  });

  test("close rejects every pending call and further transacts", async () => {
    const { sock, ws } = socket({});
    ws.open();
    await sock.ready;
    const a = sock.transact([{ ":k/id": 1 }]);
    const b = sock.transactMany([[{ ":k/id": 2 }]]);
    await Promise.resolve();
    expect(sock.pending).toBe(2);
    sock.close();
    expect(((await a.catch((e) => e)) as RippleError).message).toContain("closed");
    expect(((await b.catch((e) => e)) as RippleError).message).toContain("closed");
    expect(sock.pending).toBe(0);
    expect(sock.isClosed).toBe(true);
    expect(((await sock.transact([{ ":k/id": 3 }]).catch((e) => e)) as RippleError)).toBeInstanceOf(RippleError);
  });

  test("a server-side close rejects pending calls too", async () => {
    const { sock, ws } = socket({});
    ws.open();
    await sock.ready;
    const p = sock.transact([{ ":k/id": 1 }]);
    await Promise.resolve();
    ws.close(1011, "transactor gone");
    const err = (await p.catch((e) => e)) as RippleError;
    expect(err.message).toContain("1011");
    expect(err.message).toContain("transactor gone");
  });

  test("ready rejects when the socket errors before open", async () => {
    const { sock, ws } = socket({});
    ws.fail("connect refused");
    const err = (await sock.ready.catch((e) => e)) as RippleError;
    expect(err).toBeInstanceOf(RippleError);
    expect(err.message).toContain("connect refused");
  });

  test("ready rejects when the socket closes before open", async () => {
    const { sock, ws } = socket({});
    ws.close(1006);
    expect(((await sock.ready.catch((e) => e)) as RippleError).message).toContain("closed");
  });

  test("no WebSocket implementation is a RippleError, not a TypeError", () => {
    const client = new RippleClient("https://x.example.com");
    const saved = (globalThis as any).WebSocket;
    (globalThis as any).WebSocket = undefined;
    try {
      expect(() => client.db("app").writeSocket()).toThrow(RippleError);
    } finally {
      (globalThis as any).WebSocket = saved;
    }
  });

  test("the fetch-based transact is untouched by the socket", async () => {
    let seen: { url: string; init: any } | undefined;
    const client = new RippleClient("https://x.example.com", {
      token: "tok",
      fetch: (async (url: any, init: any) => {
        seen = { url: String(url), init };
        return new Response(JSON.stringify({ t: 3, txEid: 1003, tempids: {}, datoms: 1 }), { status: 200, headers: { "content-type": "application/json" } });
      }) as any,
    });
    const db = client.db("app");
    db.writeSocket({ WebSocket: FakeSocket as any });
    const r = await db.transact([{ ":k/id": 1 }]);
    expect(r.t).toBe(3);
    expect(seen?.url).toBe("https://x.example.com/db/app/transact");
    expect(seen?.init.headers.authorization).toBe("Bearer tok");
  });
});
