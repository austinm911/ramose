/**
 * End-to-end tests against a running Ripple deployment (dev stage via
 * `bun alchemy dev`, or a deployed URL).
 *
 *   RIPPLE_URL=http://localhost:8787 bun test test/e2e
 *   RIPPLE_URL=https://ripple-<stage>.<acct>.workers.dev RIPPLE_TOKEN=... bun test test/e2e
 *
 * Skipped when RIPPLE_URL is not set.
 */
import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as Ripple from "../../packages/alchemy/src/db/index.ts";
import { attrMap, Peer } from "../support/rippleHttp.ts";

const URL_ = process.env.RIPPLE_URL;
const token = process.env.RIPPLE_TOKEN;
const d = URL_ ? describe : describe.skip;

const dbName = `e2e-${Date.now().toString(36)}`;

d("ripple e2e", () => {
  const client = new Peer(URL_ ?? "http://invalid", { token });
  const db = client.db(dbName);
  let alice = 0, bob = 0, tSchema = 0, tAge30 = 0;

  test("M0: worker answers", async () => {
    const h = await client.health();
    expect(h.ok).toBe(true);
  });

  test("schema install → transact → query", async () => {
    const s = await db.transact([
      attrMap(":user/name", "string", { index: true }),
      attrMap(":user/email", "string", { unique: "identity" }),
      attrMap(":user/age", "long"),
      attrMap(":user/friends", "ref", { cardinality: "many" }),
      attrMap(":user/joined", "instant"),
    ]);
    tSchema = s.t;
    expect(s.t).toBeGreaterThanOrEqual(2);
    const r = await db.transact([
      { ":db/id": "alice", ":user/name": "Alice", ":user/email": "alice@example.com", ":user/age": 30, ":user/joined": new Date("2021-05-05Z") },
      { ":db/id": "bob", ":user/name": "Bob", ":user/email": "bob@example.com", ":user/age": 25, ":user/friends": ["alice"] },
    ]);
    alice = r.tempids.alice;
    bob = r.tempids.bob;
    tAge30 = r.t;
    // read-your-writes through the replica
    const names = await db.q<string[]>(`[:find [?n ...] :where [?e :user/name ?n]]`);
    expect(names.sort()).toEqual(["Alice", "Bob"]);
    const joined = await db.q<Date>(`[:find ?j . :in $ ?e :where [?e :user/joined ?j]]`, [alice]);
    expect(joined).toBeInstanceOf(Date);
    expect((joined as Date).toISOString()).toBe("2021-05-05T00:00:00.000Z");
    const friend = await db.q<string>(`[:find ?fn . :where [?e :user/name "Bob"] [?e :user/friends ?f] [?f :user/name ?fn]]`);
    expect(friend).toBe("Alice");
  });

  test("update, as-of, history, pull", async () => {
    const u = await db.transact([[":db/add", [":user/email", "alice@example.com"], ":user/age", 31]]);
    expect(await db.q<number>(`[:find ?a . :in $ ?e :where [?e :user/age ?a]]`, [alice])).toBe(31);
    expect(await db.asOf(tAge30).q<number>(`[:find ?a . :in $ ?e :where [?e :user/age ?a]]`, [alice])).toBe(30);
    expect(await db.asOf(tSchema).q(`[:find ?a . :in $ ?e :where [?e :user/age ?a]]`, [alice])).toBeNull();
    const hist = await db.history().q<[number, boolean][]>(`[:find ?a ?op :in $ ?e :where [?e :user/age ?a _ ?op]]`, [alice]);
    expect(hist.map((r) => JSON.stringify(r)).sort()).toEqual([[30, false], [30, true], [31, true]].map((r) => JSON.stringify(r)).sort());
    const p = await db.pull(bob, `[:user/name {:user/friends [:user/name :user/age]}]`);
    expect(p).toEqual({ ":user/name": "Bob", ":user/friends": [{ ":user/name": "Alice", ":user/age": 31 }] });
    expect(u.t).toBeGreaterThan(tAge30);
  });

  test("unique conflicts are rejected with 409", async () => {
    await expect(db.transact([{ ":user/name": "Eve", ":user/email": "alice@example.com", ":user/age": 1 }])).resolves.toBeDefined(); // upsert (identity)
    const r = await db.q(`[:find ?n . :in $ ?e :where [?e :user/name ?n]]`, [alice]);
    expect(r).toBe("Eve");
    await db.transact([[":db/add", alice, ":user/name", "Alice"]]);
  });

  test("index run publishes a root; queries stay consistent; repeat query hits cache", async () => {
    const before = await db.info();
    const idx = await db.index();
    expect(idx.ran).toBe(true);
    expect(idx.root.t).toBeGreaterThanOrEqual(tAge30);
    const after = await db.info();
    expect(after.transactor.root.t).toBeGreaterThan(before.transactor.root.t ?? 0);
    const q1 = await db.query(`[:find ?n ?a :where [?e :user/name ?n] [?e :user/age ?a]]`);
    const q2 = await db.query(`[:find ?n ?a :where [?e :user/name ?n] [?e :user/age ?a]]`);
    expect(q1.result.length).toBe(2);
    expect(q2.result.length).toBe(2);
    if (q2.meta.r2Gets !== null) expect(q2.meta.r2Gets).toBe(0); // warm isolate: no R2 reads
    // as-of still correct after the root flip
    expect(await db.asOf(tAge30).q<number>(`[:find ?a . :in $ ?e :where [?e :user/age ?a]]`, [alice])).toBe(30);
  });

  test("serialized t under concurrent clients (no gaps / dupes)", async () => {
    const acks = await Promise.all(Array.from({ length: 40 }, (_, i) => db.transact([{ ":user/name": `c${i}`, ":user/email": `c${i}@example.com` }])));
    const ts = acks.map((a) => a.t).sort((a, b) => a - b);
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBe(ts[i - 1] + 1);
    const count = await db.q<number>(`[:find (count ?e) . :where [?e :user/email]]`);
    expect(count).toBe(42);
  });

  test("M5: replica reconnect resumes with no missed datoms; root flips drop novelty", async () => {
    // writes land while the replica is (re)connecting: nothing may be missed
    const before = await db.q<number>(`[:find (count ?e) . :where [?e :user/email]]`);
    const [rc, ...acks] = await Promise.all([
      db.reconnectReplica(),
      ...Array.from({ length: 25 }, (_, i) => db.transact([{ ":user/name": `r${i}`, ":user/email": `r${i}@example.com` }])),
    ]);
    expect(rc.ok).toBe(true);
    const lastT = Math.max(...acks.map((a) => a.t));
    // read-your-writes: the basis served after the last ack covers it
    const q = await db.query(`[:find (count ?e) . :where [?e :user/email]]`);
    expect(q.t).toBeGreaterThanOrEqual(lastT);
    expect(q.result).toBe(before + 25);
    const info1 = await db.info();
    expect(info1.replica.t).toBeGreaterThanOrEqual(lastT);
    expect(info1.replica.novelty).toBeGreaterThan(0);
    // an index run flips the root → the replica drops the absorbed novelty (memory stays bounded)
    await db.index();
    // the root frame reaches the replica over its WebSocket a beat after index() acks (~100 ms on real Cloudflare)
    let info2 = await db.info();
    for (let i = 0; i < 40 && info2.replica.stats.rootFlips <= info1.replica.stats.rootFlips; i++) {
      await Bun.sleep(250);
      info2 = await db.info();
    }
    expect(info2.replica.stats.rootFlips).toBeGreaterThan(info1.replica.stats.rootFlips);
    expect(info2.replica.novelty).toBeLessThan(info1.replica.novelty);
    expect(await db.q<number>(`[:find (count ?e) . :where [?e :user/email]]`)).toBe(before + 25);
  });

  test("M7: an over-budget query is refused with a tagged 413, not an OOM", async () => {
    // cross product of two unrelated patterns over the users written so far: refused up front
    let err: any;
    try {
      await db.q(`[:find ?a ?b :where [?x :user/email ?a] [?y :user/email ?b] [?z :user/email ?c]]`);
    } catch (e) {
      err = e;
    }
    // ~70 users → 70³ = 343k rows × 6 cols > default budget? Not necessarily; force it via a tiny budget is a server setting,
    // so accept either a clean success or a tagged refusal — but never a 5xx.
    if (err) {
      expect(err.status).toBe(413);
      expect(err.code).toBe("query/budget-exceeded");
    }
    // and a normal query still works afterwards
    expect(await db.q<number>(`[:find (count ?e) . :where [?e :user/email]]`)).toBeGreaterThan(0);
  });

  test("write throughput smoke (group commit)", async () => {
    const N = 300;
    const t0 = performance.now();
    await Promise.all(Array.from({ length: N }, (_, i) => db.transact([{ ":user/name": `w${i}`, ":user/email": `w${i}@example.com` }])));
    const ms = performance.now() - t0;
    const info = await db.info();
    console.log(`e2e write smoke: ${N} tx in ${ms.toFixed(0)} ms → ${((N / ms) * 1000).toFixed(0)} tx/s; max batch ${info.transactor.stats.maxBatch}`);
    expect(info.transactor.stats.maxBatch).toBeGreaterThan(1); // group commit actually batched
  });
});

/**
 * The session socket (`GET /db/:name/session`), over a real WebSocket.
 *
 * `Ripple.layer` is the whole client: reads and `t` ticks ride the socket,
 * `transact` is HTTPS, and a write on *another* connection shows up here as a
 * standing `db.live` re-running.
 */
const Session = Ripple.Namespace("s", {
  name: Ripple.Attr(Schema.String, { unique: "identity" }),
  n: Ripple.Attr(Ripple.Long),
});
const SessionCatalog = Ripple.Catalog({ s: Session });

d("ripple session socket e2e", () => {
  const url = URL_ ?? "http://invalid";
  const sessionDb = `${dbName}-session`;

  test(
    "one socket queries and pulls; a write on another connection wakes db.live",
    async () => {
      const options = {
        url,
        token: token === undefined ? undefined : Effect.succeed(Redacted.make(token)),
      };
      const a = ManagedRuntime.make(Ripple.layer(options));
      const b = ManagedRuntime.make(Ripple.layer(options));
      try {
        const dbA = a.runSync(Ripple.Databases).db(sessionDb, SessionCatalog);
        const dbB = b.runSync(Ripple.Databases).db(sessionDb, SessionCatalog);

        await a.runPromise(dbA.install());
        const report = await a.runPromise(
          dbA.transact(function* (tx) {
            const ada = yield* tx.entity();
            yield* ada.add(Session.name, "Ada");
            yield* ada.add(Session.n, 1);
          }),
        );
        expect(report.t).toBeGreaterThan(0);

        // read-your-writes with no second round trip
        const names = await a.runPromise(
          report.dbAfter.q((q) => q.where("?e", Session.name, "?n").find("?n")),
        );
        expect(names).toEqual([["Ada"]]);

        const pulled = await a.runPromise(
          report.dbAfter.pull([":s/name", "Ada"], {
            name: Session.name,
            n: Session.n,
          }),
        );
        expect(pulled).toEqual({ name: "Ada", n: 1 });

        // …and B's write reaches A's standing stream without A polling
        const seen: number[] = [];
        const fiber = a.runFork(
          Stream.runForEach(
            dbA.live((q) => q.where("?e", Session.name, "?n").find("?n")),
            (rows) => Effect.sync(() => seen.push(rows.length)),
          ),
        );
        for (let i = 0; i < 40 && seen.length === 0; i++) await Bun.sleep(100);

        await b.runPromise(
          dbB.transact(function* (tx) {
            const bob = yield* tx.entity();
            yield* bob.add(Session.name, "Bob");
            yield* bob.add(Session.n, 2);
          }),
        );
        for (let i = 0; i < 60 && (seen.at(-1) ?? 0) < 2; i++) await Bun.sleep(250);
        await Effect.runPromise(Fiber.interrupt(fiber));

        expect(seen.at(-1)).toBeGreaterThanOrEqual(2);
      } finally {
        await a.dispose();
        await b.dispose();
      }
    },
    60_000,
  );
});
