/**
 * The refresh half of the socket's auth: the first token rides the upgrade,
 * `{ op: "auth", token }` swaps it on an open socket. Nothing standing is torn
 * down by a swap — that is the whole point of having a setter.
 */

import { describe, expect, test } from "bun:test";
import { RuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Client from "../src/Client.ts";
import { fromResponse } from "../src/DatabaseTypes.ts";
import { openSession, type WebSocketLike } from "../src/Session.ts";
import { Session as SchemaFxSession } from "../src/schema/index.ts";

import { Movies, User } from "./schema/fixture.ts";

const run = <A, E>(eff: Effect.Effect<A, E, RuntimeContext>) =>
  Effect.runPromise(eff.pipe(Effect.provide(RuntimeContext.phantom)));

const runFail = <A, E>(eff: Effect.Effect<A, E, RuntimeContext>) =>
  Effect.runPromise(Effect.flip(eff).pipe(Effect.provide(RuntimeContext.phantom)));

interface Frame {
  id: number;
  op: string;
  [field: string]: unknown;
}

/** A reply frame minus its `id`. An ack is `{ ok: true }`; `status` makes it a refusal. */
interface Reply {
  ok?: boolean;
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

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
      queueMicrotask(() =>
        emit("message", { data: JSON.stringify({ id: frame.id, ...reply }) }),
      );
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
    push: (frame: unknown) => emit("message", { data: JSON.stringify(frame) }),
  };
};

const settle = () => Bun.sleep(20);

describe("setToken", () => {
  test("sends one auth frame and resolves on the peer's ack", async () => {
    const peer = fakePeer((frame) => (frame.op === "auth" ? { ok: true } : undefined));
    const session = openSession({
      url: "https://peer.example.com",
      name: "movies",
      token: "first",
      connect: peer.connect,
    });

    await session.setToken(Redacted.make("second"));

    expect(peer.sent).toEqual([{ id: 1, op: "auth", token: "second" }]);
    expect(Redacted.value(session.token!)).toBe("second");
  });

  test("the initial token still rides the upgrade — auth is refresh only", () => {
    let handshake = "";
    const peer = fakePeer(() => ({ ok: true }));
    openSession({
      url: "https://peer.example.com",
      name: "movies",
      token: "first",
      connect: (url) => {
        handshake = url;
        return peer.connect();
      },
    });
    expect(handshake).toBe("wss://peer.example.com/db/movies/session?token=first");
    expect(peer.sent).toHaveLength(0);
  });

  test("a refused swap rejects with Unauthorized, carrying code and attr", async () => {
    const peer = fakePeer(() => ({
      status: 401,
      body: { error: "token expired", code: "auth/expired" },
    }));
    const session = openSession({
      url: "https://peer.example.com",
      name: "movies",
      token: "first",
      connect: peer.connect,
    });

    const error = await session.setToken("stale").then(
      () => undefined,
      (e: unknown) => e as { _tag: string; message: string; code?: string },
    );
    expect(error?._tag).toBe("Unauthorized");
    expect(error?.message).toBe("token expired");
    expect(error?.code).toBe("auth/expired");
    // the refused token is not adopted: the socket is still the old principal
    expect(Redacted.value(session.token!)).toBe("first");
  });

  test("a 403 policy denial is Unauthorized with the attribute it tripped on", async () => {
    const peer = fakePeer(() => ({
      status: 403,
      body: { error: "Unauthorized", code: "policy", attr: ":doc/owner" },
    }));
    const session = openSession({
      url: "https://peer.example.com",
      name: "movies",
      connect: peer.connect,
    });
    const db = Client.make({
      url: "https://peer.example.com",
      name: "movies",
      fetch: session.fetch,
    });

    const e = await runFail(db.transact([{ ":doc/owner": 1 }]));
    expect(e._tag).toBe("Unauthorized");
    if (e._tag === "Unauthorized") {
      expect(e.code).toBe("policy");
      expect(e.attr).toBe(":doc/owner");
    }
  });

  test("the same body classified straight off the HTTP path agrees", () => {
    const e = fromResponse(403, { error: "Unauthorized", code: "policy", attr: ":doc/owner" });
    expect(e._tag).toBe("Unauthorized");
    if (e._tag === "Unauthorized") {
      expect(e.code).toBe("policy");
      expect(e.attr).toBe(":doc/owner");
    }
    // an auth failure with no policy detail carries neither key
    const bare = fromResponse(401, { error: "no token" });
    expect(bare._tag).toBe("Unauthorized");
    if (bare._tag === "Unauthorized") {
      expect(bare.code).toBeUndefined();
      expect(bare.attr).toBeUndefined();
    }
  });

  test("a dead socket refuses the swap as NetworkError", async () => {
    const peer = fakePeer(() => undefined);
    const session = openSession({
      url: "https://peer.example.com",
      name: "movies",
      connect: peer.connect,
    });
    session.close();
    const error = await session.setToken("second").then(
      () => undefined,
      (e: unknown) => e as { _tag: string },
    );
    expect(error?._tag).toBe("NetworkError");
    expect(peer.sent).toHaveLength(0);
  });

  test("frames sent after the ack are ordered behind it", async () => {
    const peer = fakePeer((frame) =>
      frame.op === "auth" ? { ok: true } : { body: { t: 1, root: 1, result: [] } },
    );
    const session = openSession({
      url: "https://peer.example.com",
      name: "movies",
      connect: peer.connect,
    });
    const db = Client.make({
      url: "https://peer.example.com",
      name: "movies",
      fetch: session.fetch,
    });

    await session.setToken("second");
    await run(db.q("[]"));

    expect(peer.sent.map((f) => f.op)).toEqual(["auth", "q"]);
    expect(peer.sent.map((f) => f.id)).toEqual([1, 2]);
  });
});

describe("a token swap is not a reconnect", () => {
  test("db.live keeps its store, its subscribers and its snapshot", async () => {
    const state = { t: 2, rows: [[1001]] as number[][] };
    const peer = fakePeer((frame) => {
      switch (frame.op) {
        case "transact":
          return { body: { t: 2, txEid: 1, tempids: { "tmp-1": 1001 }, datoms: 4 } };
        case "auth":
          return { ok: true };
        case "q":
          return { body: { t: state.t, root: state.t, result: state.rows } };
        case "pull":
          return { body: { t: state.t, result: { name: `row-${frame.eid}` } } };
        default:
          return { status: 404, body: { error: "no such op" } };
      }
    });

    const { session, db } = await run(
      SchemaFxSession.connect({
        url: "https://peer.example.com",
        name: "movies",
        catalog: Movies,
        token: "first",
        connect: peer.connect,
      }),
    );

    const store = db.live((q) =>
      q.where("?e", User.name, "?n").find("?e").pull({ name: User.name }),
    );
    let changes = 0;
    store.subscribe(() => {
      changes += 1;
    });
    await settle();
    expect(store.get()).toEqual([{ name: "row-1001", eid: expect.anything() }]);
    const before = changes;

    await session.setToken("second");
    await settle();

    // the swap neither closed the socket nor disturbed the store
    expect(store.get()).toEqual([{ name: "row-1001", eid: expect.anything() }]);
    expect(changes).toBe(before);
    expect(store.error).toBeUndefined();

    // and it still follows the basis, under the new principal
    state.t = 5;
    state.rows = [[1001], [1002]];
    peer.push({ op: "t", t: 5 });
    await settle();
    expect(store.get()).toHaveLength(2);
    expect(changes).toBeGreaterThan(before);
    session.close();
  });
});
