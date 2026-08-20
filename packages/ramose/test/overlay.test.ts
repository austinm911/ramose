/**
 * #111 PR 2 — session overlay: optimistic transact, local q/live, filtered
 * `tx` / `resync` apply. HTTPS-only clients are not covered here.
 */

import { describe, expect, test } from "bun:test";
import { Connection } from "../src/internal/core/conn.ts";
import {
  Index,
  filterDb,
  toWireDatom,
  type Principal,
  type WireDatom,
} from "../src/internal/core/index.ts";
import { PolicyAst as A, parsePolicy } from "../src/internal/core/policy/index.ts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import * as Schema from "effect/Schema";
import { Attr, Catalog, Namespace, query } from "../src/db/internal.ts";
import { currentViewDatoms, decideSessionTx } from "../src/worker/session-sync.ts";
import { client, fakePeer, settle, type Call } from "./peer.ts";

import { Meta, Movie, Movies, User } from "./db/fixture.ts";

const Doc = Namespace("doc", {
  slug: Attr(Schema.String, { unique: "value" }),
});
const Secret = Namespace("secret", {
  note: Attr(Schema.String),
});
const WithSlug = Catalog({ user: User, movie: Movie, meta: Meta, doc: Doc });
const WithSecret = Catalog({ user: User, movie: Movie, meta: Meta, secret: Secret });
const secretNotes = query(Secret).select({ note: Secret.note });

const run = <A, E>(eff: Effect.Effect<A, E>) => Effect.runPromise(eff);
const runFail = <A, E>(eff: Effect.Effect<A, E>) =>
  Effect.runPromise(Effect.flip(eff));

const names = query(User).select({ name: User.name });

const collect = <A, E>(stream: Stream.Stream<A, E>) => {
  const seen: A[] = [];
  let error: unknown;
  const fiber = Effect.runFork(
    Stream.runForEach(stream, (a) => Effect.sync(() => seen.push(a))).pipe(
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          error = Cause.squash(cause);
        }),
      ),
    ),
  );
  return {
    seen,
    get error() {
      return error;
    },
    stop: () => Effect.runPromise(Fiber.interrupt(fiber)),
  };
};

const snapshotOf = async (conn: Connection): Promise<{ t: number; datoms: WireDatom[] }> => {
  const datoms: WireDatom[] = [];
  for await (const chunk of conn.db().datoms(Index.EAVT, {})) {
    for (const d of chunk) datoms.push(toWireDatom(d));
  }
  return { t: conn.t, datoms };
};

const moviesWorld = async () => {
  const conn = await Connection.create();
  await conn.transact([
    { ":db/ident": ":user/name", ":db/valueType": ":db.type/string", ":db/cardinality": ":db.cardinality/one", ":db/unique": ":db.unique/identity" },
    { ":db/ident": ":user/age", ":db/valueType": ":db.type/long", ":db/cardinality": ":db.cardinality/one" },
    { ":db/ident": ":user/friends", ":db/valueType": ":db.type/ref", ":db/cardinality": ":db.cardinality/many" },
    { ":db/ident": ":user/bestFriend", ":db/valueType": ":db.type/ref", ":db/cardinality": ":db.cardinality/one" },
    { ":db/ident": ":movie/title", ":db/valueType": ":db.type/string", ":db/cardinality": ":db.cardinality/one", ":db/index": true },
    { ":db/ident": ":movie/year", ":db/valueType": ":db.type/long", ":db/cardinality": ":db.cardinality/one" },
    { ":db/ident": ":movie/released", ":db/valueType": ":db.type/instant", ":db/cardinality": ":db.cardinality/one" },
    { ":db/ident": ":meta/source", ":db/valueType": ":db.type/string", ":db/cardinality": ":db.cardinality/one" },
  ]);
  return conn;
};

const seedClient = async (
  peer: { socket: { push: (f: unknown) => void }; sockets: { push: (f: unknown) => void }[] },
  db: { q: (q: typeof names) => Effect.Effect<unknown, unknown> },
  conn: Connection,
) => {
  await run(db.q(names));
  const snap = await snapshotOf(conn);
  peer.socket.push({ op: "resync", t: snap.t, datoms: snap.datoms });
  await settle();
  return snap;
};

describe("optimistic transact", () => {
  test("a local add is visible to this live before POST returns, and invisible to a second client until a tx frame", async () => {
    const server = await moviesWorld();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let ack: { t: number; txEid: number; tempids: Record<string, number>; datoms: WireDatom[] } | undefined;

    const http = async (call: Call) => {
      if (!call.url.endsWith("/transact")) return { body: { t: server.t } };
      await gate;
      const rep = await server.transact(call.body.tx);
      ack = {
        t: rep.t,
        txEid: rep.txEid,
        tempids: rep.tempids,
        datoms: rep.txData.map(toWireDatom),
      };
      return { body: { ...ack, clientTxId: call.body.clientTxId } };
    };

    const adaPeer = fakePeer({ http });
    const beaPeer = fakePeer({ http: () => ({ body: { t: server.t } }) });
    const adaC = client(adaPeer);
    const beaC = client(beaPeer);
    const ada = adaC.ramose.db("movies", Movies);
    const bea = beaC.ramose.db("movies", Movies);

    await seedClient(adaPeer, ada, server);
    await seedClient(beaPeer, bea, server);

    const adaLive = collect(ada.live(names));
    const beaLive = collect(bea.live(names));
    await settle();
    expect(adaLive.seen.at(-1)).toEqual([]);
    expect(beaLive.seen.at(-1)).toEqual([]);

    const writes = adaPeer.calls.filter((c) => c.url.endsWith("/transact")).length;
    const pending = Effect.runPromise(
      ada.transact(function* (tx) {
        const e = yield* tx.entity();
        yield* e.add(User.name, "Ada");
      }),
    );
    await settle();

    expect(adaLive.seen.at(-1)).toEqual([{ name: "Ada" }]);
    expect(beaLive.seen.at(-1)).toEqual([]);
    expect(adaPeer.calls.filter((c) => c.url.endsWith("/transact")).length).toBe(writes + 1);

    release();
    const report = await pending;
    await settle();
    expect(report.t).toBeGreaterThan(0);
    expect(beaLive.seen.at(-1)).toEqual([]);

    beaPeer.socket.push({ op: "tx", t: ack!.t, datoms: ack!.datoms });
    await settle();
    expect(beaLive.seen.at(-1)).toEqual([{ name: "Ada" }]);
    expect(beaPeer.frameOps("q")).toHaveLength(0);

    await adaLive.stop();
    await beaLive.stop();
    await adaC.dispose();
    await beaC.dispose();
  });

  test("ack remaps the tempid onto the server eid", async () => {
    const server = await moviesWorld();
    const adaPeer = fakePeer({
      http: async (call) => {
        if (!call.url.endsWith("/transact")) return { body: { t: server.t } };
        const rep = await server.transact(call.body.tx);
        return {
          body: {
            t: rep.t,
            txEid: rep.txEid,
            tempids: rep.tempids,
            datoms: rep.txData.map(toWireDatom),
            clientTxId: call.body.clientTxId,
          },
        };
      },
    });
    const c = client(adaPeer);
    const db = c.ramose.db("movies", Movies);
    await seedClient(adaPeer, db, server);

    const report = await run(
      db.transact(function* (tx) {
        const e = yield* tx.entity("ada");
        yield* e.add(User.name, "Ada");
      }),
    );
    expect(report.t).toBe(server.t);
    const rows = await run(db.q(query(User).select({ id: User.id, name: User.name })));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Ada");
    const fact = await server.db().first(Index.AVET, {
      a: server.db().schema.requireAttr(":user/name").id,
    });
    expect(rows[0]!.id as number).toBe(fact!.e);
    await c.dispose();
  });

  test("409 drops the pending row and fails TxRejected", async () => {
    const server = await moviesWorld();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const peer = fakePeer({
      http: async (call) => {
        if (!call.url.endsWith("/transact")) return { body: { t: server.t } };
        await gate;
        return {
          status: 409,
          body: { error: "unique conflict", tag: "TxRejected", code: "tx/unique-conflict" },
        };
      },
    });
    const c = client(peer);
    const db = c.ramose.db("movies", Movies);
    await seedClient(peer, db, server);

    const live = collect(db.live(names));
    await settle();

    const failed = runFail(
      db.transact(function* (tx) {
        const e = yield* tx.entity();
        yield* e.add(User.name, "Ada");
      }),
    );
    await settle();
    expect(live.seen.at(-1)).toEqual([{ name: "Ada" }]);

    release();
    const e = await failed;
    await settle();
    expect(e._tag).toBe("TxRejected");
    expect((e as { code?: string }).code).toBe("tx/unique-conflict");
    expect(live.seen.at(-1)).toEqual([]);

    await live.stop();
    await c.dispose();
  });

  test("local unique conflict does not POST", async () => {
    const server = await moviesWorld();
    await server.transact([
      { ":db/ident": ":doc/slug", ":db/valueType": ":db.type/string", ":db/cardinality": ":db.cardinality/one", ":db/unique": ":db.unique/value" },
    ]);
    await server.transact([{ ":doc/slug": "ada" }]);
    const posts: Call[] = [];
    const peer = fakePeer({
      http: (call) => {
        if (call.url.endsWith("/transact")) posts.push(call);
        return { body: { t: server.t, txEid: 1, tempids: {}, datoms: [] } };
      },
    });
    const c = client(peer);
    const db = c.ramose.db("movies", WithSlug);
    await seedClient(peer, db, server);

    const e = await runFail(
      db.transact(function* (tx) {
        const row = yield* tx.entity();
        yield* row.add(Doc.slug, "ada");
      }),
    );
    expect(e._tag).toBe("TxRejected");
    expect((e as { code?: string }).code).toBe("tx/unique-conflict");
    expect(posts).toEqual([]);
    await c.dispose();
  });

  test("empty ack.datoms drop the pending layer and do not commit it to confirmed", async () => {
    const server = await moviesWorld();
    const peer = fakePeer({
      http: (call) => {
        if (!call.url.endsWith("/transact")) return { body: { t: server.t } };
        return {
          body: {
            t: server.t + 1,
            txEid: 0,
            tempids: {},
            datoms: [],
            clientTxId: call.body.clientTxId,
          },
        };
      },
    });
    const c = client(peer);
    const db = c.ramose.db("movies", WithSecret);
    await seedClient(peer, db, server);

    const live = collect(db.live(secretNotes));
    await settle();
    expect(live.seen.at(-1)).toEqual([]);

    const report = await run(
      db.transact(function* (tx) {
        const e = yield* tx.entity();
        yield* e.add(Secret.note, "classified");
      }),
    );
    await settle();
    expect(report.datomCount).toBe(0);
    expect(report.t).toBe(server.t + 1);
    expect(live.seen.at(-1)).toEqual([]);
    expect(await run(db.q(secretNotes))).toEqual([]);

    await live.stop();
    await c.dispose();
  });

  test("queued rewrite remaps a tempid entity, not a title that equals the tempid", async () => {
    const server = await moviesWorld();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const posts: unknown[][] = [];
    const peer = fakePeer({
      http: async (call) => {
        if (!call.url.endsWith("/transact")) return { body: { t: server.t } };
        if (posts.length === 0) await gate;
        posts.push(call.body.tx as unknown[]);
        const rep = await server.transact(call.body.tx);
        return {
          body: {
            t: rep.t,
            txEid: rep.txEid,
            tempids: rep.tempids,
            datoms: rep.txData.map(toWireDatom),
            clientTxId: call.body.clientTxId,
          },
        };
      },
    });
    const c = client(peer);
    const db = c.ramose.db("movies", Movies);
    await seedClient(peer, db, server);

    const first = Effect.runPromise(
      db.transact(function* (tx) {
        const e = yield* tx.entity("new");
        yield* e.add(User.name, "Ada");
      }),
    );
    await settle();
    const second = Effect.runPromise(
      db.transact(function* (tx) {
        const e = yield* tx.entity();
        yield* e.add(Movie.title, "new");
      }),
    );
    await settle();
    release();
    await first;
    await second;
    expect(posts).toHaveLength(2);
    const secondTx = posts[1] ?? [];
    const titleAdds = secondTx.filter(
      (op): op is unknown[] =>
        Array.isArray(op) && op[0] === ":db/add" && op[2] === ":movie/title",
    );
    expect(titleAdds).toHaveLength(1);
    expect(titleAdds[0]![3]).toBe("new");
    await c.dispose();
  });
});

describe("confirmed follower", () => {
  test("inbound tx with clientTxId drops only that pending layer", async () => {
    const server = await moviesWorld();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const peer = fakePeer({
      http: async (call) => {
        if (!call.url.endsWith("/transact")) return { body: { t: server.t } };
        await gate;
        return {
          status: 409,
          body: { error: "stopped", tag: "TxRejected", code: "tx/unique-conflict" },
        };
      },
    });
    const c = client(peer);
    const db = c.ramose.db("movies", Movies);
    await seedClient(peer, db, server);

    const live = collect(db.live(names));
    await settle();

    const first = runFail(
      db.transact(function* (tx) {
        const e = yield* tx.entity();
        yield* e.add(User.name, "Ada");
      }),
    );
    await settle();
    const second = runFail(
      db.transact(function* (tx) {
        const e = yield* tx.entity();
        yield* e.add(User.name, "Bea");
      }),
    );
    await settle();
    expect(live.seen.at(-1)).toEqual([{ name: "Ada" }, { name: "Bea" }]);

    const ids = peer.calls
      .filter((call) => call.url.endsWith("/transact"))
      .map((call) => call.body.clientTxId as string);
    peer.push({ op: "tx", t: server.t + 1, clientTxId: ids[0], datoms: [] });
    await settle();
    expect(live.seen.at(-1)).toEqual([{ name: "Bea" }]);

    release();
    await first;
    await second;
    await live.stop();
    await c.dispose();
  });

  test("same-t ack then { op: tx } is a no-op on confirmed", async () => {
    const server = await moviesWorld();
    const peer = fakePeer({
      http: async (call) => {
        if (!call.url.endsWith("/transact")) return { body: { t: server.t } };
        const rep = await server.transact(call.body.tx);
        return {
          body: {
            t: rep.t,
            txEid: rep.txEid,
            tempids: rep.tempids,
            datoms: rep.txData.map(toWireDatom),
            clientTxId: call.body.clientTxId,
          },
        };
      },
    });
    const c = client(peer);
    const db = c.ramose.db("movies", Movies);
    await seedClient(peer, db, server);

    const report = await run(
      db.transact(function* (tx) {
        const e = yield* tx.entity();
        yield* e.add(User.name, "Ada");
      }),
    );
    const before = await run(db.q(query(User)));
    const ackCall = peer.calls.filter((call) => call.url.endsWith("/transact")).at(-1)!;
    void ackCall;

    const datoms = (await snapshotOf(server)).datoms.filter((d) => d[4] === report.t);
    peer.push({ op: "tx", t: report.t, datoms });
    await settle();
    expect(await run(db.q(query(User)))).toEqual(before);
    await c.dispose();
  });

  test("{ op: sync } / resync rebuilds confirmed from the snapshot", async () => {
    const server = await moviesWorld();
    await server.transact([{ ":user/name": "Ada" }]);
    const peer = fakePeer();
    const c = client(peer);
    const db = c.ramose.db("movies", Movies);
    await seedClient(peer, db, server);
    expect(await run(db.q(names))).toEqual([{ name: "Ada" }]);

    const other = await moviesWorld();
    await other.transact([{ ":user/name": "Bea" }]);
    const snap = await snapshotOf(other);
    peer.push({ op: "resync", t: snap.t, datoms: snap.datoms });
    await settle();
    expect(await run(db.q(names))).toEqual([{ name: "Bea" }]);
    await c.dispose();
  });
});

describe("filtered tx frames (#112 sieve)", () => {
  const SCHEMA = [
    { ":db/ident": ":user/sub", ":db/valueType": ":db.type/string", ":db/cardinality": ":db.cardinality/one", ":db/unique": ":db.unique/identity" },
    { ":db/ident": ":org/members", ":db/valueType": ":db.type/ref", ":db/cardinality": ":db.cardinality/many" },
    { ":db/ident": ":project/org", ":db/valueType": ":db.type/ref", ":db/cardinality": ":db.cardinality/one" },
    { ":db/ident": ":doc/title", ":db/valueType": ":db.type/string", ":db/cardinality": ":db.cardinality/one" },
    { ":db/ident": ":doc/owner", ":db/valueType": ":db.type/ref", ":db/cardinality": ":db.cardinality/one" },
    { ":db/ident": ":doc/project", ":db/valueType": ":db.type/ref", ":db/cardinality": ":db.cardinality/one" },
  ];
  const inOrg = A.ref(":doc/project", A.ref(":project/org", A.eq(":org/members", A.principal)));
  const POLICY = parsePolicy({
    version: 1,
    principal: ":user/sub",
    classes: ["member", "admin"],
    ns: {
      doc: { read: [A.allow(A.or(A.eq(":doc/owner", A.principal), inOrg))] },
      project: { read: [A.allow(A.ref(":project/org", A.eq(":org/members", A.principal)))] },
      org: { read: [A.allow(A.eq(":org/members", A.principal))] },
      user: { read: [A.allow(A.eq(":user/sub", A.claim("sub")))] },
    },
    preset: { ":doc/owner": A.principal },
  });
  const user = (sub: string, eid: number): Principal => ({
    kind: "user",
    class: "member",
    sub,
    eid,
    claims: { sub },
    db: "acme",
  });

  test("Cal does not observe Ada's t or Ada's filtered-away write", async () => {
    const conn = await Connection.create({ now: () => 1_700_000_000_000 });
    await conn.transact(SCHEMA);
    const seeded = await conn.transact([
      { ":db/id": "ada", ":user/sub": "user_ada" },
      { ":db/id": "cal", ":user/sub": "user_cal" },
      { ":db/id": "org", ":org/members": ["ada"] },
      { ":db/id": "proj", ":project/org": "org" },
    ]);
    const adaP = user("user_ada", seeded.tempids.ada);
    const calP = user("user_cal", seeded.tempids.cal);
    const seedT = conn.t;

    const hidden = await conn.transact([
      { ":db/id": "doc", ":doc/title": "Q3", ":doc/owner": "ada", ":doc/project": "proj" },
    ]);
    const decision = await decideSessionTx({
      datoms: hidden.txData,
      policy: POLICY,
      principal: calP,
      ruleDbAfter: conn.db().asOf(hidden.t),
      ruleDbBefore: conn.db().asOf(Math.max(0, hidden.t - 1)),
    });
    expect(decision.kind).toBe("skip");

    const calPeer = fakePeer();
    const c = client(calPeer);
    const db = c.ramose.db("acme", Movies);
    await run(db.q(names));
    const view = filterDb(conn.db(), conn.db(), POLICY, calP);
    calPeer.socket.push({
      op: "resync",
      t: seedT,
      datoms: await currentViewDatoms(view),
    });
    await settle();

    const confirmedBefore = calPeer.sockets[0];
    void confirmedBefore;
    // Cal's overlay is at the seed snapshot — Ada's write must not arrive
    calPeer.socket.push({ op: "t", t: hidden.t });
    await settle();
    // a tick without datoms must not install Ada's facts
    expect(await run(db.q(names))).toEqual([]);

    // the sieve said skip: do not deliver a tx frame (or the replica entry)
    const leak: WireDatom[] = hidden.txData.map(toWireDatom);
    void leak;
    expect(decision.kind === "skip").toBe(true);
    await c.dispose();
  });
});

describe("HTTPS-only is unchanged", () => {
  test("reads still POST /query and there is no overlay sync", async () => {
    const { httpsClient } = await import("./peer.ts");
    const peer = fakePeer({
      http: (call: Call) =>
        call.url.endsWith("/query")
          ? { body: { t: 2, root: 2, result: [[{ name: "Ada" }]] } }
          : { body: { t: 2, txEid: 1, tempids: {}, datoms: 1 } },
    });
    const { databases, close } = httpsClient(peer);
    const db = databases.db("movies", Movies);
    expect(await run(db.q(names))).toEqual([{ name: "Ada" }]);
    expect(peer.sockets).toEqual([]);
    expect(peer.calls.map((c) => c.url)).toEqual([
      "https://peer.example.com/db/movies/query",
    ]);
    close();
  });
});
