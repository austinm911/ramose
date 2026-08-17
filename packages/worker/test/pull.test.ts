/**
 * `POST /db/:name/pull` against an attribute the database has never installed.
 *
 * The pull engine is deliberately lenient — an unknown attribute is skipped
 * rather than thrown on (Datomic throws) — which made a pull against an
 * uninstalled database return a silent subset while the same query would fail
 * `InvalidRequest`. The API contract is that both are `InvalidRequest`, so the
 * route checks the pattern against the schema before it runs.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { makePeer, post } from "./harness.ts";

const peer = makePeer("acme");
afterAll(() => peer.close());

const attr = (ident: string, type: string) => ({
  ":db/ident": ident,
  ":db/valueType": `:db.type/${type}`,
  ":db/cardinality": ":db.cardinality/one",
});

describe("pull against an uninstalled attribute", () => {
  test("is a 400, and names the attribute", async () => {
    await peer.seed([attr(":doc/title", "string")]);
    const seeded = await peer.seed([{ ":db/id": "doc", ":doc/title": "Roadmap" }]);
    const eid = seeded.tempids.doc;

    // installed: the value comes back
    const ok = await peer.json(
      "/db/acme/pull",
      post({ eid, pattern: [":doc/title"] }),
    );
    expect(ok.status).toBe(200);
    expect(ok.body.result[":doc/title"]).toBe("Roadmap");

    // never installed: a refusal, not a subset
    const bad = await peer.json(
      "/db/acme/pull",
      post({ eid, pattern: [":doc/title", ":doc/nope"] }),
    );
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain(":doc/nope");

    // …exactly as the same attribute in a query is
    const query = await peer.json(
      "/db/acme/query",
      post({ query: { find: ["?e"], where: [["?e", ":doc/nope", "?v"]] } }),
    );
    expect(query.status).toBe(400);
  });

  test("the check follows nested sub-patterns", async () => {
    await peer.seed([
      { ":db/ident": ":doc/author", ":db/valueType": ":db.type/ref", ":db/cardinality": ":db.cardinality/one" },
    ]);
    const bad = await peer.json(
      "/db/acme/pull",
      post({
        eid: 1,
        pattern: [
          { kind: "attr", attr: ":doc/author", reverse: false, as: "author", sub: [{ kind: "attr", attr: ":user/ghost", reverse: false, as: "ghost" }] },
        ],
      }),
    );
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain(":user/ghost");
  });

  test("`*` and `:db/id` are not attributes, so they pass", async () => {
    const seeded = await peer.seed([{ ":db/id": "doc", ":doc/title": "Ship it" }]);
    const wild = await peer.json(
      "/db/acme/pull",
      post({ eid: seeded.tempids.doc, pattern: ["*"] }),
    );
    expect(wild.status).toBe(200);
    expect(wild.body.result[":doc/title"]).toBe("Ship it");
  });
});
