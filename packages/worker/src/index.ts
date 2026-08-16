/**
 * Ripple peer Worker — the HTTP API and the edge datalog executor.
 *
 * Read-path knobs (per request by header, default by env — see peer.ts):
 * `x-ripple-replica-hint: wnam|enam|…|auto|continent` picks the replica DO placement
 * (hint is part of the DO id; default `auto` = colo→hint); `x-ripple-cache-basis: 0|1`
 * (default 1) reuses an isolate-cached basis instead of calling the replica each read;
 * `x-ripple-cache-mode: ttl|peer` (default ttl = 5 s) picks the cache's consistency story;
 * `x-ripple-min-t: <t>` makes a read refetch if the cached basis is older than t.
 *
 *   GET  /                                  demo app (CRUD + as-of history view)
 *   GET  /health
 *   POST /db/:name/transact   { tx }        → { t, txEid, tempids, datoms }
 *   POST /db/:name/query      { query, inputs?, asOf?, history? }   → { t, result }
 *   POST /db/:name/pull       { eid, pattern, asOf?, history? }     → { t, result }
 *   GET  /db/:name/entity/:eid[?asOf=]                              → { t, entity }
 *   GET  /db/:name/info                                            → transactor + replica + basis info
 *   POST /db/:name/admin/index | /admin/gc                         → indexer controls
 *
 * Reads: basis (root + novelty) from the nearest QueryReplica DO → Db over
 * cached segments → datalog here in the Worker. Writes: forwarded to the
 * Transactor DO. Auth: per-db bearer token (RIPPLE_TOKENS), disabled if unset.
 */

import { DEFAULT_QUERY_MAX_CELLS, Histogram, QueryBudgetError, type QueryStats, RateMeter, componentLogger, fromJson, pull, query, setTelemetryLevel, toJson } from "@ripple/core";
import { type RippleEnv, envInt } from "@ripple/transactor";
import { TransactorDO } from "@ripple/transactor/transactor-do.ts";
import { QueryReplicaDO, dbFromBasis } from "@ripple/replica";
import { basisHeaders, fetchBasisWithStats, hintOf, invalidateBasis, regionOf, replicaId, segmentSource } from "./peer.ts";
import { DEMO_HTML } from "./demo.ts";

export { TransactorDO, QueryReplicaDO };

// ---- peer metrics (per isolate) --------------------------------------------
const plog = componentLogger("peer");
const peerMetrics = {
  queries: new RateMeter(10_000),
  transacts: new RateMeter(10_000),
  queryMs: new Histogram(),
  transactMs: new Histogram(),
  budgetAborts: 0,
  errors: 0,
};
let levelApplied = false;

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(toJson(body)), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*", ...extra },
  });

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization,x-ripple-replica-hint,x-ripple-cache-basis,x-ripple-cache-mode,x-ripple-min-t",
  "access-control-expose-headers": "x-ripple-ms,x-ripple-r2-gets,x-ripple-cache-hits,x-ripple-basis-t,x-ripple-basis-hit,x-ripple-basis-reason,x-ripple-basis-calls,x-ripple-basis-behind,x-ripple-replica-hint,x-ripple-cache-basis,x-ripple-cache-mode,x-ripple-colo",
};

function authorized(env: RippleEnv, db: string, request: Request): boolean {
  if (!env.RIPPLE_TOKENS) return true;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : new URL(request.url).searchParams.get("token") ?? "";
  let map: Record<string, string> | string;
  try {
    map = JSON.parse(env.RIPPLE_TOKENS);
  } catch {
    map = env.RIPPLE_TOKENS;
  }
  if (typeof map === "string") return token === map;
  const expected = map[db] ?? map["*"];
  return expected !== undefined && token === expected;
}

function validDbName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name);
}

export default {
  async fetch(request: Request, env: RippleEnv): Promise<Response> {
    if (!levelApplied) {
      levelApplied = true;
      const lvl = env.RIPPLE_LOG_LEVEL;
      if (lvl === "debug" || lvl === "info" || lvl === "warn" || lvl === "error") setTelemetryLevel(lvl);
    }
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(DEMO_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/health") return json({ ok: true, service: "ripple", stage: env.RIPPLE_STAGE ?? "dev", time: Date.now() });

    const m = /^\/db\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (!m) return json({ error: "not found" }, 404);
    const db = decodeURIComponent(m[1]);
    const rest = m[2] ?? "/";
    if (!validDbName(db)) return json({ error: "invalid database name" }, 400);
    if (!authorized(env, db, request)) return json({ error: "unauthorized" }, 401);

    const transactor = () => env.TRANSACTOR.get(env.TRANSACTOR.idFromName(db));
    const txUrl = (path: string) => `https://transactor${path}${path.includes("?") ? "&" : "?"}db=${encodeURIComponent(db)}`;
    const t0 = Date.now();

    try {
      // ---- writes → Transactor DO
      if (rest === "/transact" && request.method === "POST") {
        const res = await transactor().fetch(txUrl("/transact"), { method: "POST", body: await request.text(), headers: { "content-type": "application/json" } });
        invalidateBasis(db); // a write through this Worker must be visible to this isolate's next cached read
        const ms = Date.now() - t0;
        peerMetrics.transacts.mark(1);
        peerMetrics.transactMs.observe(ms);
        plog.debug("transact", { db, status: res.status, ms });
        return new Response(res.body, { status: res.status, headers: { "content-type": "application/json", ...CORS, "x-ripple-ms": String(Date.now() - t0) } });
      }
      if (rest === "/admin/replica/reconnect" && request.method === "POST") {
        // chaos/ops: drop the nearest replica's novelty subscription; it must resume with no missed datoms
        const res = await env.REPLICA.get(replicaId(env, db, regionOf(request), 1, hintOf(request, env))).fetch(`https://replica/admin/reconnect?db=${encodeURIComponent(db)}`, { method: "POST" });
        return new Response(res.body, { status: res.status, headers: { "content-type": "application/json", ...CORS } });
      }
      if (rest.startsWith("/admin/") && request.method === "POST") {
        const res = await transactor().fetch(txUrl(rest), { method: "POST" });
        return new Response(res.body, { status: res.status, headers: { "content-type": "application/json", ...CORS } });
      }

      // ---- reads → replica basis + local execution
      if (rest === "/query" && request.method === "POST") {
        const body = fromJson(await request.json()) as { query: unknown; inputs?: unknown[]; asOf?: number; history?: boolean; explain?: boolean };
        if (!body?.query) return json({ error: "body must be { query, inputs? }" }, 400);
        const bf = await fetchBasisWithStats(env, db, request);
        const basis = bf.basis;
        const store = segmentSource(env, db);
        const dbv = await dbFromBasis(store, basis, { asOf: typeof body.asOf === "number" ? body.asOf : undefined, history: !!body.history });
        const stats: QueryStats = { clauses: [] };
        const before = { ...store.stats };
        const result = await query(dbv, body.query as any, body.inputs ?? [], { stats, maxCells: envInt(env.RIPPLE_QUERY_MAX_CELLS, DEFAULT_QUERY_MAX_CELLS) });
        const after = store.stats;
        const ms = Date.now() - t0;
        peerMetrics.queries.mark(1);
        peerMetrics.queryMs.observe(ms);
        plog.debug("query", { db, ms, rows: Array.isArray(result) ? result.length : 1, basisT: basis.t, basisHit: bf.hit, basisReason: bf.reason, novelty: basis.novelty.length, r2Gets: after.r2Gets - before.r2Gets, cacheHits: after.cacheHits - before.cacheHits, peakCells: stats?.budget?.peakCells });
        return json(
          { t: basis.t, root: basis.root.t, result, ...(body.explain ? { explain: stats.clauses, budget: stats.budget } : {}) },
          200,
          { "x-ripple-ms": String(Date.now() - t0), "x-ripple-r2-gets": String(after.r2Gets - before.r2Gets), "x-ripple-cache-hits": String(after.cacheHits - before.cacheHits), ...basisHeaders(request, env, bf) },
        );
      }
      if (rest === "/pull" && request.method === "POST") {
        const body = fromJson(await request.json()) as { eid: number | string | [string, unknown]; pattern: unknown; asOf?: number; history?: boolean };
        const bf = await fetchBasisWithStats(env, db, request);
        const basis = bf.basis;
        const dbv = await dbFromBasis(segmentSource(env, db), basis, { asOf: typeof body.asOf === "number" ? body.asOf : undefined, history: !!body.history });
        const eid = typeof body.eid === "number" ? body.eid : await dbv.entid(body.eid as any);
        if (eid === undefined) return json({ t: basis.t, result: null }, 200, { "x-ripple-ms": String(Date.now() - t0), ...basisHeaders(request, env, bf) });
        return json({ t: basis.t, result: await pull(dbv, eid, body.pattern as any) }, 200, { "x-ripple-ms": String(Date.now() - t0), ...basisHeaders(request, env, bf) });
      }
      const em = /^\/entity\/(\d+)$/.exec(rest);
      if (em && request.method === "GET") {
        const bf = await fetchBasisWithStats(env, db, request);
        const basis = bf.basis;
        const asOf = url.searchParams.has("asOf") ? Number(url.searchParams.get("asOf")) : undefined;
        const dbv = await dbFromBasis(segmentSource(env, db), basis, { asOf });
        return json({ t: basis.t, entity: await dbv.entity(Number(em[1])) }, 200, { "x-ripple-ms": String(Date.now() - t0), ...basisHeaders(request, env, bf) });
      }
      if (rest === "/info" && request.method === "GET") {
        const [tx, rep] = await Promise.all([
          transactor().fetch(txUrl("/info")).then((r) => r.json()),
          env.REPLICA.get(replicaId(env, db, regionOf(request), 1, hintOf(request, env))).fetch(`https://replica/info?db=${encodeURIComponent(db)}`).then((r) => r.json()),
        ]);
        return json({
          db,
          region: regionOf(request),
          transactor: tx,
          replica: rep,
          peer: segmentSource(env, db).stats,
          peerMetrics: { queriesPerSec: peerMetrics.queries.rate(), transactsPerSec: peerMetrics.transacts.rate(), queryMs: peerMetrics.queryMs.snapshot(), transactMs: peerMetrics.transactMs.snapshot(), budgetAborts: peerMetrics.budgetAborts, errors: peerMetrics.errors },
        });
      }
      return json({ error: "not found" }, 404);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof QueryBudgetError) {
        // planner memory guardrail: clear, tagged, retryable-with-a-narrower-query — never an OOM
        peerMetrics.budgetAborts++;
        plog.warn("query.budget-exceeded", { db, clause: err.clause, cells: err.cells, limit: err.limit, ms: Date.now() - t0 });
        return json({ error: msg, code: err.code, clause: err.clause, cells: err.cells, limit: err.limit }, 413);
      }
      const status = /unknown attribute|not bound|insufficient|parse|EDN|QueryError/i.test(msg) ? 400 : 500;
      if (status === 500) {
        peerMetrics.errors++;
        plog.error("request.error", { db, path: rest, error: msg });
      }
      const stack = env.RIPPLE_STAGE !== "prod" && err instanceof Error ? err.stack : undefined;
      return json({ error: msg, stack }, status);
    }
  },
};
