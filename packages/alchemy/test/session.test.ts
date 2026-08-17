/**
 * The session socket, from the client's side.
 *
 * `GET /db/:name/session` is the only socket the client speaks, and it
 * terminates in the peer Worker's isolate. Reads become correlated frames on
 * it, `{ op: "t" }` ticks arrive unsolicited, and — unlike the socket this
 * replaces — a drop is not terminal: the next read opens a fresh socket, with
 * the token re-read. A 401/403 is handled in place with `{ op: "auth" }`.
 */

import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import type { QueryBuilder } from "../src/db/internal.ts";
import { client, fakePeer, settle } from "./peer.ts";

import { Movies, User } from "./db/fixture.ts";

const run = <A, E>(eff: Effect.Effect<A, E>) => Effect.runPromise(eff);
const runFail = <A, E>(eff: Effect.Effect<A, E>) =>
  Effect.runPromise(Effect.flip(eff));

const rows = (result: unknown[], t = 2) => ({ body: { t, root: t, result } });

type Q = QueryBuilder<typeof Movies>;
/** The one query every test here runs; only the transport is under test. */
const names = (q: Q) => q.where("?e", User.name, "?n").find("?n");
const eids = (q: Q) => q.where("?e", User.name, "_").find("?e");

describe("the handshake", () => {
  test("is the ws form of /db/:name/session, with the token as a query param", async () => {
    const peer = fakePeer({ answer: () => rows([]) });
    const c = client(peer, {
      url: "https://peer.example.com/",
      token: Effect.succeed(Redacted.make("s3cret")),
    });
    await run(
      c.ripple.db("a.b-c_1", Movies).q(eids),
    );
    expect(peer.sockets[0].url).toBe(
      "wss://peer.example.com/db/a.b-c_1/session?token=s3cret",
    );
    await c.dispose();
  });

  test("no token, no query param — and http becomes ws", async () => {
    const peer = fakePeer({ answer: () => rows([]) });
    const c = client(peer, { url: "http://localhost:8787" });
    await run(
      c.ripple.db("movies", Movies).q(eids),
    );
    expect(peer.sockets[0].url).toBe("ws://localhost:8787/db/movies/session");
    await c.dispose();
  });

  test("one socket per database name, opened once", async () => {
    const peer = fakePeer({ answer: () => rows([]) });
    const c = client(peer);

    await run(c.ripple.db("movies", Movies).q(names));
    await run(c.ripple.db("movies", Movies).q(names));
    await run(c.ripple.db("other", Movies).q(names));

    expect(peer.sockets).toHaveLength(2);
    expect(peer.sockets.map((s) => s.url)).toEqual([
      "wss://peer.example.com/db/movies/session",
      "wss://peer.example.com/db/other/session",
    ]);
    await c.dispose();
  });
});

describe("reads become frames", () => {
  test("q and pull each become their op, with asOf / history on the body", async () => {
    const peer = fakePeer({
      answer: (frame) =>
        frame.op === "pull"
          ? { body: { t: 2, result: { name: "Ada" } } }
          : rows([[1001]]),
    });
    const c = client(peer);
    const db = c.ripple.db("movies", Movies);

    await run(db.q((q: Q) => q.where("?e", User.name, "?n").find("?e")));
    await run(db.asOf(3).history.pull({ id: 17 }, { name: User.name }));
    await run(db.history.q(names));

    expect(peer.frames).toEqual([
      {
        id: 1,
        op: "q",
        query: { find: ["?e"], where: [["?e", ":user/name", "?n"]] },
        inputs: [],
      },
      {
        id: 2,
        op: "pull",
        eid: 17,
        pattern: [
          { kind: "attr", attr: ":user/name", reverse: false, as: "name" },
        ],
        asOf: 3,
        history: true,
      },
      {
        id: 3,
        op: "q",
        query: { find: ["?n"], where: [["?e", ":user/name", "?n"]] },
        inputs: [],
        history: true,
      },
    ]);
    await c.dispose();
  });

  test("a lookup ref subject lowers to [ident, value]", async () => {
    const peer = fakePeer({ answer: () => ({ body: { t: 2, result: null } }) });
    const c = client(peer);
    await run(
      c.ripple
        .db("movies", Movies)
        .pull([":user/name", "Ada"], { name: User.name }),
    );
    expect(peer.frames[0].eid).toEqual([":user/name", "Ada"]);
    await c.dispose();
  });

  test("out-of-order replies land on the request that asked", async () => {
    const peer = fakePeer({ answer: () => undefined });
    const c = client(peer);
    const db = c.ripple.db("movies", Movies);
    const build = (n: string) => (q: Q) => q.where("?e", User.name, n).find("?n");

    const first = run(db.q(build("a")));
    const second = run(db.q(build("b")));
    await settle(5);
    expect(peer.frames.map((f) => f.id)).toEqual([1, 2]);

    peer.push({ id: 2, status: 200, body: { t: 1, root: 1, result: [["b"]] } });
    peer.push({ id: 1, status: 200, body: { t: 1, root: 1, result: [["a"]] } });
    expect(await first).toEqual([["a"]]);
    expect(await second).toEqual([["b"]]);
    await c.dispose();
  });

  test("a refusal frame classifies exactly as the HTTP path does", async () => {
    const peer = fakePeer({
      answer: () => ({
        status: 413,
        body: {
          error: "budget",
          code: "query/budget-exceeded",
          clause: "[?e ?a ?v]",
          cells: 9,
          limit: 8,
        },
      }),
    });
    const c = client(peer);
    const e = await runFail(
      c.ripple.db("movies", Movies).q((q: Q) => q.where("?e", "?a", "?v").find("?e")),
    );
    expect(e._tag).toBe("QueryBudgetExceeded");
    if (e._tag === "QueryBudgetExceeded") {
      expect(e.limit).toBe(8);
      expect(e.clause).toBe("[?e ?a ?v]");
    }
    await c.dispose();
  });
});

describe("a socket that goes away", () => {
  test("fails what is in flight as NetworkError", async () => {
    const peer = fakePeer({ answer: () => undefined });
    const c = client(peer);
    const inFlight = runFail(
      c.ripple.db("movies", Movies).q(eids),
    );
    await settle(5);
    expect(peer.frames).toHaveLength(1);

    peer.drop();
    expect((await inFlight)._tag).toBe("NetworkError");
    await c.dispose();
  });

  test("but the next read reconnects, re-reading the token", async () => {
    let issued = 0;
    const peer = fakePeer({ answer: () => rows([["Ada"]]) });
    const c = client(peer, {
      token: Effect.sync(() => Redacted.make(`token-${++issued}`)),
    });
    const db = c.ripple.db("movies", Movies);

    expect(await run(db.q(names))).toEqual([["Ada"]]);
    peer.drop();
    expect(await run(db.q(names))).toEqual([["Ada"]]);

    expect(peer.sockets.map((s) => s.url)).toEqual([
      "wss://peer.example.com/db/movies/session?token=token-1",
      "wss://peer.example.com/db/movies/session?token=token-2",
    ]);
    await c.dispose();
  });

  test("a refused upgrade is a NetworkError, and the one after it succeeds", async () => {
    const peer = fakePeer({ answer: () => rows([]), refuseUpgrades: 1 });
    const c = client(peer);
    const db = c.ripple.db("movies", Movies);

    expect((await runFail(db.q(names)))._tag).toBe("NetworkError");
    expect(await run(db.q(names))).toEqual([]);
    expect(peer.sockets).toHaveLength(2);
    await c.dispose();
  });
});

describe("Unauthorized is handled in place", () => {
  test("a 401 re-reads the token, swaps the principal and re-issues the frame", async () => {
    let issued = 0;
    let refusals = 1;
    const peer = fakePeer({
      answer: (frame) => {
        if (frame.op === "auth") return { ok: true };
        if (refusals > 0) {
          refusals -= 1;
          return { status: 401, body: { error: "token expired", code: "auth/expired" } };
        }
        return rows([["Ada"]]);
      },
    });
    const c = client(peer, {
      token: Effect.sync(() => Redacted.make(`token-${++issued}`)),
    });

    expect(
      await run(
        c.ripple
          .db("movies", Movies)
          .q(names),
      ),
    ).toEqual([["Ada"]]);

    // one socket, three frames: the refused read, the swap, the retry
    expect(peer.sockets).toHaveLength(1);
    expect(peer.frames.map((f) => f.op)).toEqual(["q", "auth", "q"]);
    expect(peer.frames[1].token).toBe("token-2"); // re-read, not the handshake's
    await c.dispose();
  });

  test("a swap the peer also refuses surfaces as Unauthorized", async () => {
    const peer = fakePeer({
      answer: (frame) =>
        frame.op === "auth"
          ? { status: 403, body: { error: "Unauthorized", code: "policy", attr: ":doc/owner" } }
          : { status: 403, body: { error: "Unauthorized", code: "policy", attr: ":doc/owner" } },
    });
    const c = client(peer, { token: Effect.succeed(Redacted.make("stale")) });
    const e = await runFail(
      c.ripple.db("movies", Movies).q(names),
    );
    expect(e._tag).toBe("Unauthorized");
    if (e._tag === "Unauthorized") {
      expect(e.code).toBe("policy");
      expect(e.attr).toBe(":doc/owner");
    }
    await c.dispose();
  });

  test("with no token configured there is nothing to swap", async () => {
    const peer = fakePeer({
      answer: () => ({ status: 401, body: { error: "unauthorized" } }),
    });
    const c = client(peer);
    const e = await runFail(
      c.ripple.db("movies", Movies).q(eids),
    );
    expect(e._tag).toBe("Unauthorized");
    expect(peer.frames.map((f) => f.op)).toEqual(["q"]);
    await c.dispose();
  });
});

describe("the layer's scope owns the socket", () => {
  test("disposing the runtime closes it, and nothing reopens", async () => {
    const peer = fakePeer({ answer: () => rows([]) });
    const c = client(peer);
    const db = c.ripple.db("movies", Movies);

    await run(db.q(names));
    expect(peer.sockets).toHaveLength(1);

    await c.dispose();
    expect((await runFail(db.q(names)))._tag).toBe("NetworkError");
    expect(peer.sockets).toHaveLength(1);
  });
});
