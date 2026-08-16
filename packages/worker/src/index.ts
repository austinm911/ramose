/**
 * Ripple peer Worker — the HTTP API; reads execute on the QueryReplica.
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
 * Reads: forwarded to the nearest QueryReplica DO, which executes datalog /
 * pull / entity over its basis (root + novelty) and cached segments — the
 * Worker does not run query() itself. Writes: forwarded to the Transactor DO.
 * Auth: per-db bearer token (RIPPLE_TOKENS), disabled if unset.
 */

import { Histogram, RateMeter, componentLogger, setTelemetryLevel, toJson } from "@ripple/core";
import type { RippleEnv } from "@ripple/transactor";
import { TransactorDO } from "@ripple/transactor/transactor-do.ts";
import { QueryReplicaDO } from "@ripple/replica";
import { readFromReplica, regionOf, replicaId, segmentSource } from "./peer.ts";
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
  "access-control-allow-headers": "content-type,authorization",
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
        const ms = Date.now() - t0;
        peerMetrics.transacts.mark(1);
        peerMetrics.transactMs.observe(ms);
        plog.debug("transact", { db, status: res.status, ms });
        return new Response(res.body, { status: res.status, headers: { "content-type": "application/json", ...CORS, "x-ripple-ms": String(Date.now() - t0) } });
      }
      if (rest === "/admin/replica/reconnect" && request.method === "POST") {
        // chaos/ops: drop the nearest replica's novelty subscription; it must resume with no missed datoms
        const res = await env.REPLICA.get(replicaId(env, db, regionOf(request))).fetch(`https://replica/admin/reconnect?db=${encodeURIComponent(db)}`, { method: "POST" });
        return new Response(res.body, { status: res.status, headers: { "content-type": "application/json", ...CORS } });
      }
      if (rest.startsWith("/admin/") && request.method === "POST") {
        const res = await transactor().fetch(txUrl(rest), { method: "POST" });
        return new Response(res.body, { status: res.status, headers: { "content-type": "application/json", ...CORS } });
      }

      // ---- reads → executed on the nearest QueryReplica (SPEC §8); the Worker only forwards
      if (rest === "/query" && request.method === "POST") {
        const res = await readFromReplica(env, db, request, await request.text(), t0);
        const ms = Date.now() - t0;
        peerMetrics.queries.mark(1);
        peerMetrics.queryMs.observe(ms);
        if (res.status === 413) peerMetrics.budgetAborts++; // replica refused an over-budget query (query/budget-exceeded)
        else if (res.status >= 500) peerMetrics.errors++;
        plog.debug("query", { db, ms, status: res.status, basisT: res.headers.get("x-ripple-basis-t"), r2Gets: res.headers.get("x-ripple-r2-gets"), cacheHits: res.headers.get("x-ripple-cache-hits") });
        return res;
      }
      if (rest === "/pull" && request.method === "POST") {
        const body = (await request.json()) as { eid: unknown; pattern: unknown; asOf?: number; history?: boolean };
        if (!body || body.eid === undefined || !body.pattern) return json({ error: "body must be { eid, pattern, asOf?, history? }" }, 400);
        return readFromReplica(env, db, request, JSON.stringify({ pull: { eid: body.eid, pattern: body.pattern }, asOf: body.asOf, history: body.history }), t0);
      }
      const em = /^\/entity\/(\d+)$/.exec(rest);
      if (em && request.method === "GET") {
        const asOf = url.searchParams.has("asOf") ? Number(url.searchParams.get("asOf")) : undefined;
        return readFromReplica(env, db, request, JSON.stringify({ entity: Number(em[1]), asOf }), t0);
      }
      if (rest === "/info" && request.method === "GET") {
        const [tx, rep] = await Promise.all([
          transactor().fetch(txUrl("/info")).then((r) => r.json()),
          env.REPLICA.get(replicaId(env, db, regionOf(request))).fetch(`https://replica/info?db=${encodeURIComponent(db)}`).then((r) => r.json()),
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
