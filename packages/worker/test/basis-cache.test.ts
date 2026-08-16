/**
 * Read-path knobs in packages/worker/src/peer.ts, exercised with a fake REPLICA
 * namespace (index.ts imports `cloudflare:workers` via the DO classes, so the
 * helpers are tested directly):
 *   - cache hit skips GET /basis; miss / cache-off call it
 *   - a transact through this isolate (invalidateBasis) forces the next read to refetch
 *   - ttl mode expires after 5 s; peer mode does not (long safety TTL only)
 *   - x-ripple-min-t refetches when the cached basis is behind (and polls a lagging replica)
 *   - colo→hint: IAD-like colos map to enam, SJC-like to wnam; header/env/auto precedence
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { BASIS_SAFETY_TTL_MS, BASIS_TTL_MS, cacheModeOf, clearBasisCache, coloHint, fetchBasisWithStats, hintOf, invalidateBasis, minTOf, replicaId, wantsBasisCache } from "../src/peer.ts";

function fakeEnv(basisT: () => number, extra: Record<string, string> = {}) {
  const calls: { id: string; url: string; hint?: string }[] = [];
  const env = {
    ...extra,
    REPLICA: {
      idFromName: (name: string) => ({ name, toString: () => name }),
      get: (id: { name: string }, opts?: { locationHint?: string }) => ({
        fetch: async (url: string) => {
          calls.push({ id: id.name, url, hint: opts?.locationHint });
          const t = basisT();
          return new Response(JSON.stringify({ t, root: { t: 1 }, novelty: [], replica: "r" }), { headers: { "content-type": "application/json" } });
        },
      }),
    },
  } as any;
  return { env, calls };
}

function req(headers: Record<string, string> = {}, cf: Record<string, string> = { continent: "NA", colo: "IAD" }) {
  const r = new Request("https://ripple.example/db/demo/query", { method: "POST", headers });
  (r as any).cf = cf;
  return r;
}

const realNow = Date.now;
function withClock(offsetMs: number) {
  Date.now = () => realNow() + offsetMs;
}

describe("basis cache knobs", () => {
  beforeEach(() => {
    clearBasisCache();
    Date.now = realNow;
  });

  test("cache off (default): every read calls GET /basis", async () => {
    const { env, calls } = fakeEnv(() => 5);
    const a = await fetchBasisWithStats(env, "demo", req());
    const b = await fetchBasisWithStats(env, "demo", req());
    expect(a.hit).toBe(false);
    expect(a.reason).toBe("off");
    expect(b.hit).toBe(false);
    expect(calls.length).toBe(2);
    expect(calls[0].url).toBe("https://replica/basis?db=demo");
    expect(calls[0].id).toBe("demo|NA|wnam|0");
    expect(calls[0].hint).toBe("wnam");
  });

  test("cache on: first read misses, second hits without touching the replica; keyed by db|hint", async () => {
    const { env, calls } = fakeEnv(() => 5);
    const h = { "x-ripple-cache-basis": "1" };
    const a = await fetchBasisWithStats(env, "demo", req(h));
    const b = await fetchBasisWithStats(env, "demo", req(h));
    expect(a.reason).toBe("miss");
    expect(b.hit).toBe(true);
    expect(b.reason).toBe("hit");
    expect(b.calls).toBe(0);
    expect(calls.length).toBe(1);
    // different hint → different key → miss
    const c = await fetchBasisWithStats(env, "demo", req({ ...h, "x-ripple-replica-hint": "enam" }));
    expect(c.hit).toBe(false);
    expect(calls.length).toBe(2);
    expect(calls[1].id).toBe("demo|NA|enam|0");
    // other db → miss, and its invalidation does not touch demo
    await fetchBasisWithStats(env, "other", req(h));
    invalidateBasis("other");
    expect((await fetchBasisWithStats(env, "demo", req(h))).hit).toBe(true);
  });

  test("env RIPPLE_CACHE_BASIS=1 turns the cache on by default; header 0 overrides", async () => {
    const { env, calls } = fakeEnv(() => 5, { RIPPLE_CACHE_BASIS: "1" });
    expect(wantsBasisCache(req(), env)).toBe(true);
    expect(wantsBasisCache(req({ "x-ripple-cache-basis": "0" }), env)).toBe(false);
    await fetchBasisWithStats(env, "demo", req());
    expect((await fetchBasisWithStats(env, "demo", req())).hit).toBe(true);
    expect((await fetchBasisWithStats(env, "demo", req({ "x-ripple-cache-basis": "0" }))).reason).toBe("off");
    expect(calls.length).toBe(2);
  });

  test("a transact through this isolate invalidates: next read refetches and sees the new t", async () => {
    let t = 5;
    const { env, calls } = fakeEnv(() => t);
    const h = { "x-ripple-cache-basis": "1", "x-ripple-cache-mode": "peer" };
    await fetchBasisWithStats(env, "demo", req(h));
    t = 6;
    expect((await fetchBasisWithStats(env, "demo", req(h))).basis.t).toBe(5); // cached, no timer in peer mode
    invalidateBasis("demo");
    const r = await fetchBasisWithStats(env, "demo", req(h));
    expect(r.hit).toBe(false);
    expect(r.reason).toBe("miss");
    expect(r.basis.t).toBe(6);
    expect(calls.length).toBe(2);
  });

  test("ttl mode expires after 5 s; peer mode keeps serving (only the long safety TTL evicts)", async () => {
    let t = 5;
    const { env, calls } = fakeEnv(() => t);
    const ttl = { "x-ripple-cache-basis": "1", "x-ripple-cache-mode": "ttl" };
    const peer = { "x-ripple-cache-basis": "1", "x-ripple-cache-mode": "peer" };
    expect(cacheModeOf(req(ttl))).toBe("ttl");
    expect(cacheModeOf(req(peer))).toBe("peer");
    expect(cacheModeOf(req())).toBe("ttl");
    expect(cacheModeOf(req(), { RIPPLE_CACHE_MODE: "peer" })).toBe("peer");
    await fetchBasisWithStats(env, "demo", req(ttl));
    t = 6;
    withClock(BASIS_TTL_MS + 1);
    const a = await fetchBasisWithStats(env, "demo", req(ttl));
    expect(a.reason).toBe("expired");
    expect(a.basis.t).toBe(6);
    t = 7;
    withClock(BASIS_TTL_MS * 3);
    const b = await fetchBasisWithStats(env, "demo", req(peer)); // same entry, peer mode: not expired
    expect(b.hit).toBe(true);
    expect(b.basis.t).toBe(6);
    withClock(BASIS_TTL_MS + BASIS_SAFETY_TTL_MS + 1);
    const c = await fetchBasisWithStats(env, "demo", req(peer));
    expect(c.reason).toBe("expired");
    expect(c.basis.t).toBe(7);
    expect(calls.length).toBe(3);
  });

  test("x-ripple-min-t: served from cache when satisfied, refetched when behind, polls a lagging replica", async () => {
    let t = 5;
    const { env, calls } = fakeEnv(() => t);
    const peer = { "x-ripple-cache-basis": "1", "x-ripple-cache-mode": "peer" };
    expect(minTOf(req())).toBeUndefined();
    expect(minTOf(req({ "x-ripple-min-t": "9" }))).toBe(9);
    expect(minTOf(req({ "x-ripple-min-t": "nope" }))).toBeUndefined();
    await fetchBasisWithStats(env, "demo", req(peer));
    // satisfied → hit
    const a = await fetchBasisWithStats(env, "demo", req({ ...peer, "x-ripple-min-t": "5" }));
    expect(a.hit).toBe(true);
    // behind → refetch (write happened through another isolate)
    t = 8;
    const b = await fetchBasisWithStats(env, "demo", req({ ...peer, "x-ripple-min-t": "8" }));
    expect(b.hit).toBe(false);
    expect(b.reason).toBe("min-t");
    expect(b.basis.t).toBe(8);
    expect(b.calls).toBe(1);
    expect(calls.length).toBe(2);
    // subsequent read with the same fence hits the refreshed entry
    expect((await fetchBasisWithStats(env, "demo", req({ ...peer, "x-ripple-min-t": "8" }))).hit).toBe(true);
    // replica lags the transactor by a couple of polls → we wait for it
    let n = 0;
    const lag = fakeEnv(() => (++n >= 3 ? 12 : 10));
    clearBasisCache();
    const c = await fetchBasisWithStats(lag.env, "demo", req({ ...peer, "x-ripple-min-t": "12" }));
    expect(c.basis.t).toBe(12);
    expect(c.calls).toBe(3);
    expect(c.behind).toBe(false);
    // replica never catches up within the retry window → served anyway, flagged behind
    const never = fakeEnv(() => 1);
    clearBasisCache();
    const d = await fetchBasisWithStats(never.env, "demo", req({ ...peer, "x-ripple-min-t": "99" }));
    expect(d.behind).toBe(true);
    expect(d.calls).toBeGreaterThan(1);
    // min-t also fences in ttl mode (no cache) — pass-through, one call
    const off = fakeEnv(() => 3);
    const e = await fetchBasisWithStats(off.env, "demo", req({ "x-ripple-min-t": "3" }));
    expect(e.reason).toBe("off");
    expect(e.calls).toBe(1);
  });

  test("a stale refetch never overwrites a newer cached entry", async () => {
    let t = 5;
    const { env } = fakeEnv(() => t);
    const peer = { "x-ripple-cache-basis": "1", "x-ripple-cache-mode": "peer" };
    // simulate: read A starts (miss) but resolves after read B cached t=9
    await fetchBasisWithStats(env, "demo", req(peer)); // t=5 cached
    t = 9;
    invalidateBasis("demo");
    await fetchBasisWithStats(env, "demo", req(peer)); // t=9 cached
    t = 5; // an "older" replica answer arriving late
    await fetchBasisWithStats(env, "demo", req({ ...peer, "x-ripple-min-t": "10" })); // forces refetch; gets 5 (behind)
    expect((await fetchBasisWithStats(env, "demo", req(peer))).basis.t).toBe(9);
  });
});

describe("colo → hint", () => {
  test("IAD-like colos map to enam, SJC-like to wnam, unknown to undefined", () => {
    for (const c of ["IAD", "EWR", "ATL", "ORD", "MIA", "YYZ"]) expect(coloHint(c)).toBe("enam");
    for (const c of ["SJC", "LAX", "SEA", "SFO", "DEN", "YVR"]) expect(coloHint(c)).toBe("wnam");
    expect(coloHint("XYZ")).toBeUndefined();
    expect(coloHint(undefined)).toBeUndefined();
  });

  test("hintOf precedence: header > env > continent; auto resolves the colo (default stays wnam for NA)", () => {
    expect(hintOf(req())).toBe("wnam"); // today's default: continent, even from IAD
    expect(hintOf(req({ "x-ripple-replica-hint": "enam" }))).toBe("enam");
    expect(hintOf(req({ "x-ripple-replica-hint": "auto" }))).toBe("enam"); // IAD
    expect(hintOf(req({ "x-ripple-replica-hint": "auto" }, { continent: "NA", colo: "SJC" }))).toBe("wnam");
    expect(hintOf(req({ "x-ripple-replica-hint": "auto" }, { continent: "NA" }))).toBe("wnam"); // unknown colo → continent
    expect(hintOf(req({ "x-ripple-replica-hint": "bogus" }))).toBe("wnam");
    expect(hintOf(req(), { RIPPLE_REPLICA_HINT: "auto" })).toBe("enam");
    expect(hintOf(req(), { RIPPLE_REPLICA_HINT: "enam" })).toBe("enam");
    expect(hintOf(req({ "x-ripple-replica-hint": "wnam" }), { RIPPLE_REPLICA_HINT: "auto" })).toBe("wnam");
    expect(hintOf(req({}, { continent: "EU", colo: "LHR" }))).toBe("weur");
  });

  test("the hint is part of the replica id, so enam creates a different DO than wnam", () => {
    const { env } = fakeEnv(() => 1);
    expect(replicaId(env, "demo", "NA", 1, "wnam").toString()).toBe("demo|NA|wnam|0");
    expect(replicaId(env, "demo", "NA", 1, "enam").toString()).toBe("demo|NA|enam|0");
    expect(replicaId(env, "demo", "NA").toString()).toBe("demo|NA|wnam|0");
  });
});
