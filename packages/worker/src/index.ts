/**
 * Ripple peer Worker — the HTTP API and the edge datalog executor.
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

import { fromJson, pull, query, toJson } from "@ripple/core";
import { TransactorDO, type RippleEnv } from "@ripple/transactor";
import { QueryReplicaDO, dbFromBasis } from "@ripple/replica";
import { fetchBasis, regionOf, replicaId, segmentSource } from "./peer.ts";
import { DEMO_HTML } from "./demo.ts";

export { TransactorDO, QueryReplicaDO };

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
    const t0 = Date.now();

    try {
      // ---- writes → Transactor DO
      if (rest === "/transact" && request.method === "POST") {
        const res = await transactor().fetch("https://transactor/transact", { method: "POST", body: await request.text(), headers: { "content-type": "application/json" } });
        return new Response(res.body, { status: res.status, headers: { "content-type": "application/json", ...CORS, "x-ripple-ms": String(Date.now() - t0) } });
      }
      if (rest.startsWith("/admin/") && request.method === "POST") {
        const res = await transactor().fetch(`https://transactor${rest}`, { method: "POST" });
        return new Response(res.body, { status: res.status, headers: { "content-type": "application/json", ...CORS } });
      }

      // ---- reads → replica basis + local execution
      if (rest === "/query" && request.method === "POST") {
        const body = fromJson(await request.json()) as { query: unknown; inputs?: unknown[]; asOf?: number; history?: boolean; explain?: boolean };
        if (!body?.query) return json({ error: "body must be { query, inputs? }" }, 400);
        const basis = await fetchBasis(env, db, request);
        const store = segmentSource(env);
        const dbv = await dbFromBasis(store, basis, { asOf: body.asOf, history: body.history });
        const stats = body.explain ? { clauses: [] as any[] } : undefined;
        const before = { ...store.stats };
        const result = await query(dbv, body.query as any, body.inputs ?? [], { stats });
        const after = store.stats;
        return json(
          { t: basis.t, root: basis.root.t, result, ...(stats ? { explain: stats.clauses } : {}) },
          200,
          { "x-ripple-ms": String(Date.now() - t0), "x-ripple-r2-gets": String(after.r2Gets - before.r2Gets), "x-ripple-cache-hits": String(after.cacheHits - before.cacheHits), "x-ripple-basis-t": String(basis.t) },
        );
      }
      if (rest === "/pull" && request.method === "POST") {
        const body = fromJson(await request.json()) as { eid: number | string | [string, unknown]; pattern: unknown; asOf?: number; history?: boolean };
        const basis = await fetchBasis(env, db, request);
        const dbv = await dbFromBasis(segmentSource(env), basis, { asOf: body.asOf, history: body.history });
        const eid = typeof body.eid === "number" ? body.eid : await dbv.entid(body.eid as any);
        if (eid === undefined) return json({ t: basis.t, result: null });
        return json({ t: basis.t, result: await pull(dbv, eid, body.pattern as any) }, 200, { "x-ripple-ms": String(Date.now() - t0) });
      }
      const em = /^\/entity\/(\d+)$/.exec(rest);
      if (em && request.method === "GET") {
        const basis = await fetchBasis(env, db, request);
        const asOf = url.searchParams.has("asOf") ? Number(url.searchParams.get("asOf")) : undefined;
        const dbv = await dbFromBasis(segmentSource(env), basis, { asOf });
        return json({ t: basis.t, entity: await dbv.entity(Number(em[1])) });
      }
      if (rest === "/info" && request.method === "GET") {
        const [tx, rep] = await Promise.all([
          transactor().fetch("https://transactor/info").then((r) => r.json()),
          env.REPLICA.get(replicaId(env, db, regionOf(request))).fetch(`https://replica/info?db=${encodeURIComponent(db)}`).then((r) => r.json()),
        ]);
        return json({ db, region: regionOf(request), transactor: tx, replica: rep, peer: segmentSource(env).stats });
      }
      return json({ error: "not found" }, 404);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = /unknown attribute|not bound|insufficient|parse|EDN|QueryError/i.test(msg) ? 400 : 500;
      return json({ error: msg }, status);
    }
  },
};
