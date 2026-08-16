import { describe, expect, test } from "bun:test";
import { RuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import type { WebSocketLike } from "../src/Session.ts";
import { Session as SchemaFxSession } from "../src/schema/index.ts";

import { Movies, User } from "./schema/fixture.ts";

const run = <A, E>(eff: Effect.Effect<A, E, RuntimeContext>) =>
  Effect.runPromise(eff.pipe(Effect.provide(RuntimeContext.phantom)));

interface Frame {
  id: number;
  op: string;
  [field: string]: unknown;
}

interface Reply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Answer after this many ms instead of on the next microtask. */
  delay?: number;
}

/** Records every frame, answers with a canned reply, can push unsolicited ones. */
const fakePeer = (answer: (frame: Frame) => Reply | undefined) => {
  const sent: Frame[] = [];
  const listeners = new Map<string, ((ev: unknown) => void)[]>();
  const emit = (type: string, ev: unknown) => {
    for (const cb of listeners.get(type) ?? []) cb(ev);
  };
  const socket: WebSocketLike = {
    send: (data) => {
      const frame = JSON.parse(data) as Frame;
      sent.push(frame);
      const reply = answer(frame);
      if (reply === undefined) return;
      const { delay, ...body } = reply;
      const send = () =>
        emit("message", { data: JSON.stringify({ id: frame.id, ...body }) });
      if (delay === undefined) queueMicrotask(send);
      else setTimeout(send, delay);
    },
    close: () => emit("close", {}),
    addEventListener: (type, cb) => {
      listeners.set(type, [...(listeners.get(type) ?? []), cb]);
    },
  };
  return {
    sent,
    connect: () => socket,
    ops: (op: string) => sent.filter((f) => f.op === op),
    /** An unsolicited server frame (`{ op: "t", t }`). */
    push: (frame: unknown) => emit("message", { data: JSON.stringify(frame) }),
  };
};

const ensure = { t: 2, txEid: 1, tempids: { "tmp-1": 1001 }, datoms: 4 };

/** Every pass is a handful of microtasks; a tick is plenty. */
const settle = () => Bun.sleep(20);

const open = (answer: (frame: Frame) => Reply | undefined) => {
  const peer = fakePeer(answer);
  return run(
    SchemaFxSession.connect({
      url: "https://peer.example.com",
      name: "movies",
      catalog: Movies,
      connect: peer.connect,
    }),
  ).then((session) => ({ ...session, peer }));
};

/** The peer everything below shares: one q, one pull per row, `t` on demand. */
const peerAt = (state: {
  t: number;
  rows: number[][];
  names: Record<number, string | null>;
  /** what a transact acks with — the ensure lands at 2 */
  ackT?: number;
  /** hold every q reply back this many ms */
  qDelay?: number;
  /** refuse this many q frames before answering */
  qFails?: number;
  /** eids whose pull the peer refuses */
  pullFails?: number[];
}) =>
  open((frame) => {
    switch (frame.op) {
      case "transact":
        return { body: { ...ensure, t: state.ackT ?? ensure.t } };
      case "q":
        if ((state.qFails ?? 0) > 0) {
          state.qFails = (state.qFails ?? 0) - 1;
          return { status: 500, body: { error: "the replica is having a moment" } };
        }
        return {
          body: { t: state.t, root: state.t, result: state.rows },
          delay: state.qDelay,
        };
      case "pull": {
        if ((state.pullFails ?? []).includes(frame.eid as number)) {
          return { status: 500, body: { error: "no" } };
        }
        const name = state.names[frame.eid as number];
        return { body: { t: state.t, result: name == null ? null : { name } } };
      }
      default:
        return { status: 404, body: { error: "no such op" } };
    }
  });

describe("db.live is a standing db.q", () => {
  test("undefined first, then the q's rows pulled into the map", async () => {
    const state = { t: 5, rows: [[1001], [1002]], names: { 1001: "Ada", 1002: "Bob" } };
    const { db, peer, session } = await peerAt(state);

    const users = db.live((q) =>
      q.where("?e", User.name, "?n").find("?e").pull({ name: User.name }),
    );
    expect(users.get()).toBeUndefined();
    await settle();

    expect(users.get()).toEqual([
      { name: "Ada", eid: expect.objectContaining({ id: 1001 }) },
      { name: "Bob", eid: expect.objectContaining({ id: 1002 }) },
    ]);

    // the ensure is frame 1; the q is fenced at the basis this socket has seen
    expect(peer.sent[0].op).toBe("transact");
    expect(peer.ops("q")).toEqual([
      {
        id: 2,
        op: "q",
        query: { find: ["?e"], where: [["?e", ":user/name", "?n"]] },
        inputs: [],
        minT: 2,
      },
    ]);
    // one pull per row, fenced at the q's own t
    const pattern = [{ kind: "attr", attr: ":user/name", reverse: false, as: "name" }];
    expect(
      peer
        .ops("pull")
        .map((f) => ({ eid: f.eid, minT: f.minT, pattern: f.pattern }))
        .sort((a, b) => (a.eid as number) - (b.eid as number)),
    ).toEqual([
      { eid: 1001, minT: 5, pattern },
      { eid: 1002, minT: 5, pattern },
    ]);
    session.close();
  });

  test("no .pull is a store of eids, and no pull frames", async () => {
    const state = { t: 5, rows: [[1001], [1002]], names: {} };
    const { db, peer, session } = await peerAt(state);

    const eids = db.live((q) => q.where("?e", User.name, "_").find("?e"));
    await settle();

    expect(eids.get()?.map((e) => e.id)).toEqual([1001, 1002]);
    expect(peer.ops("pull")).toHaveLength(0);
    expect(peer.ops("q")[0].query).toEqual({
      find: ["?e"],
      where: [["?e", ":user/name", "_"]],
    });
    session.close();
  });

  test("a row whose pull comes back null is dropped", async () => {
    const state = {
      t: 5,
      rows: [[1001], [1002]],
      names: { 1001: "Ada", 1002: null },
    };
    const { db, session } = await peerAt(state);

    const users = db.live((q) =>
      q.where("?e", User.name, "_").find("?e").pull({ name: User.name }),
    );
    await settle();

    expect(users.get()).toEqual([
      { name: "Ada", eid: expect.objectContaining({ id: 1001 }) },
    ]);
    session.close();
  });
});

describe("the session's t is the wake", () => {
  test("a t frame re-runs at that fence; an unmoved basis short-circuits", async () => {
    const state: Parameters<typeof peerAt>[0] = {
      t: 5,
      rows: [[1001]],
      names: { 1001: "Ada" },
    };
    const { db, peer, session } = await peerAt(state);

    const users = db.live((q) =>
      q.where("?e", User.name, "_").find("?e").pull({ name: User.name }),
    );
    await settle();
    const first = users.get();
    let notified = 0;
    users.subscribe(() => {
      notified += 1;
    });

    // the basis moved, but the peer answers with the same t: nothing changed
    peer.push({ op: "t", t: 9 });
    await settle();
    expect(peer.ops("q")).toHaveLength(2);
    expect(peer.ops("q")[1].minT).toBe(9);
    expect(peer.ops("pull")).toHaveLength(1); // no second pull round
    expect(notified).toBe(0);
    expect(users.get()).toBe(first); // the same reference, for useSyncExternalStore

    // now the peer really has moved
    state.t = 12;
    state.rows = [[1001], [1002]];
    state.names = { 1001: "Ada", 1002: "Bob" };
    peer.push({ op: "t", t: 13 });
    await settle();

    expect(peer.ops("q")[2].minT).toBe(13);
    expect(peer.ops("pull").slice(1).every((f) => f.minT === 12)).toBe(true);
    expect(notified).toBe(1);
    expect(users.get()).not.toBe(first);
    expect(users.get()?.map((r) => r.name)).toEqual(["Ada", "Bob"]);
    session.close();
  });

  test("a transact on the same socket refreshes with no invalidation call", async () => {
    const state: Parameters<typeof peerAt>[0] = {
      t: 5,
      rows: [[1001]],
      names: { 1001: "Ada", 1002: "Bob" },
    };
    const { db, peer, session } = await peerAt(state);

    const users = db.live((q) =>
      q.where("?e", User.name, "_").find("?e").pull({ name: User.name }),
    );
    await settle();
    expect(users.get()).toHaveLength(1);

    // the write's own ack carries the new basis
    state.t = 30;
    state.ackT = 30;
    state.rows = [[1001], [1002]];
    await run(
      db.transact(function* (tx) {
        const bob = yield* tx.entity();
        yield* bob.add(User.name, "Bob");
      }),
    );
    await settle();

    expect(users.get()?.map((r) => r.name)).toEqual(["Ada", "Bob"]);
    expect(peer.ops("q").at(-1)?.minT).toBe(30);
    session.close();
  });

  test("subscribe returns an unsubscribe, and close stops the socket wake", async () => {
    const state = { t: 5, rows: [[1001]], names: { 1001: "Ada" } };
    const { db, peer, session } = await peerAt(state);

    const users = db.live((q) => q.where("?e", User.name, "_").find("?e"));
    await settle();

    let notified = 0;
    const off = users.subscribe(() => {
      notified += 1;
    });
    state.t = 12;
    state.rows = [[1001], [1002]];
    peer.push({ op: "t", t: 12 });
    await settle();
    expect(notified).toBe(1);

    off();
    state.t = 13;
    peer.push({ op: "t", t: 13 });
    await settle();
    expect(notified).toBe(1); // unsubscribed, but the store still tracks
    expect(users.get()).toHaveLength(2);

    users.close();
    const frames = peer.sent.length;
    peer.push({ op: "t", t: 20 });
    await settle();
    expect(peer.sent).toHaveLength(frames); // closed: nothing more is asked
    session.close();
  });
});

describe("a pass that overlaps, closes, or fails", () => {
  test("a t that lands mid-pass is drained after it, at the newer fence", async () => {
    const { db, peer, session } = await peerAt({
      t: 5,
      rows: [[1001]],
      names: { 1001: "Ada" },
      qDelay: 30,
    });

    const users = db.live((q) => q.where("?e", User.name, "_").find("?e"));
    await Bun.sleep(5); // the q is out, its reply is not back
    expect(peer.ops("q")).toHaveLength(1);

    peer.push({ op: "t", t: 9 });
    expect(peer.ops("q")).toHaveLength(1); // no second pass while one runs

    await Bun.sleep(120);
    expect(peer.ops("q").map((f) => f.minT)).toEqual([2, 9]);
    expect(users.get()?.map((e) => e.id)).toEqual([1001]);
    session.close();
  });

  test("close mid-pass emits nothing and asks for nothing more", async () => {
    const { db, peer, session } = await peerAt({
      t: 5,
      rows: [[1001]],
      names: { 1001: "Ada" },
      qDelay: 30,
    });

    const users = db.live((q) =>
      q.where("?e", User.name, "_").find("?e").pull({ name: User.name }),
    );
    let notified = 0;
    users.subscribe(() => {
      notified += 1;
    });
    await Bun.sleep(5);
    users.close();

    await Bun.sleep(120);
    expect(notified).toBe(0);
    expect(users.get()).toBeUndefined();
    expect(peer.ops("pull")).toHaveLength(0);
    session.close();
  });

  test("a subscriber registered before the first result fires when it lands", async () => {
    const { db, session } = await peerAt({
      t: 5,
      rows: [[1001]],
      names: { 1001: "Ada" },
      qDelay: 20,
    });

    const users = db.live((q) => q.where("?e", User.name, "_").find("?e"));
    let notified = 0;
    users.subscribe(() => {
      notified += 1;
    });
    expect(users.get()).toBeUndefined();

    await Bun.sleep(120);
    expect(notified).toBe(1);
    expect(users.get()).toHaveLength(1);
    session.close();
  });

  test("a failed pass records the error, then retries and recovers", async () => {
    const { db, session } = await peerAt({
      t: 5,
      rows: [[1001]],
      names: { 1001: "Ada" },
      qFails: 1,
    });

    const users = db.live((q) => q.where("?e", User.name, "_").find("?e"));
    await settle();
    expect(users.get()).toBeUndefined();
    expect(users.error).toBeDefined();

    await Bun.sleep(400); // the first backoff is 250ms
    expect(users.get()?.map((e) => e.id)).toEqual([1001]);
    expect(users.error).toBeUndefined();
    session.close();
  });

  test("one unreadable row drops out; the rest of the pass stands", async () => {
    const { db, session } = await peerAt({
      t: 5,
      rows: [[1001], [1002], [1003]],
      names: { 1001: "Ada", 1002: "Bob", 1003: "Cy" },
      pullFails: [1002],
    });

    const users = db.live((q) =>
      q.where("?e", User.name, "_").find("?e").pull({ name: User.name }),
    );
    await settle();

    expect(users.get()?.map((r) => r.name)).toEqual(["Ada", "Cy"]);
    expect(users.error).toBeUndefined();
    session.close();
  });
});
