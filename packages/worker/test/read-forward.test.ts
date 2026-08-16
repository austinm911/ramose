/**
 * The Worker read path (/query /pull /entity) forwards to the nearest
 * QueryReplica's POST /query and does not run datalog itself. `index.ts`
 * imports `cloudflare:workers` (via the DO classes) so it can't be loaded
 * here; we exercise the forwarding helper with a fake REPLICA namespace and
 * statically check the Worker entry no longer pulls in the query engine.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { READ_PASSTHROUGH_HEADERS, readFromReplica } from "../src/peer.ts";

function fakeEnv(handler: (url: string, init?: RequestInit) => Response) {
  const calls: { id: string; url: string; body: string; hint?: string }[] = [];
  const env = {
    REPLICA: {
      idFromName: (name: string) => ({ name, toString: () => name }),
      get: (id: { name: string }, opts?: { locationHint?: string }) => ({
        fetch: async (url: string, init?: RequestInit) => {
          calls.push({ id: id.name, url, body: String(init?.body ?? ""), hint: opts?.locationHint });
          return handler(url, init);
        },
      }),
    },
  } as any;
  return { env, calls };
}

describe("worker read path forwards to the replica", () => {
  test("body goes to the nearest replica's POST /query; status, body and stats headers pass through; x-ripple-ms is Worker wall time", async () => {
    const { env, calls } = fakeEnv(
      () => new Response(JSON.stringify({ t: 7, root: 5, result: [["a"]] }), { status: 200, headers: { "content-type": "application/json", "x-ripple-r2-gets": "0", "x-ripple-cache-hits": "3", "x-ripple-basis-t": "7", "x-ripple-secret": "no" } }),
    );
    const req = new Request("https://ripple.example/db/demo/query", { method: "POST" });
    (req as any).cf = { continent: "NA" };
    const t0 = Date.now() - 5;
    const res = await readFromReplica(env, "demo", req, JSON.stringify({ query: "[:find ?e :where [?e :a ?v]]" }), t0);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://replica/query?db=demo");
    expect(calls[0].id).toBe("demo|NA|0"); // same replica as fetchBasis used
    expect(calls[0].hint).toBe("wnam");
    expect(JSON.parse(calls[0].body).query).toContain(":find");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ t: 7, root: 5, result: [["a"]] });
    for (const h of READ_PASSTHROUGH_HEADERS) expect(res.headers.get(h)).not.toBeNull();
    expect(res.headers.get("x-ripple-cache-hits")).toBe("3");
    expect(res.headers.get("x-ripple-secret")).toBeNull();
    expect(Number(res.headers.get("x-ripple-ms"))).toBeGreaterThanOrEqual(5);
  });

  test("413 query/budget-exceeded from the replica is preserved", async () => {
    const { env } = fakeEnv(() => new Response(JSON.stringify({ error: "over budget", code: "query/budget-exceeded", cells: 10, limit: 5 }), { status: 413 }));
    const res = await readFromReplica(env, "demo", new Request("https://ripple.example/db/demo/query", { method: "POST" }), "{}", Date.now());
    expect(res.status).toBe(413);
    expect(((await res.json()) as any).code).toBe("query/budget-exceeded");
  });

  test("the Worker entry does not import the query engine or build a Db itself", () => {
    const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    const imports = src.match(/^import[\s\S]*?from ".*";$/gm)!.join("\n");
    for (const sym of ["query", "pull", "dbFromBasis", "fetchBasis"]) expect(new RegExp(`\\b${sym}\\b`).test(imports)).toBe(false);
    expect(src).toContain("readFromReplica(");
  });
});
