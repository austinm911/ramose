/**
 * Runtime constructors and schema lowering. No peer I/O.
 */

import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RuntimeContext } from "alchemy/RuntimeContext";
import {
  attr,
  Catalog,
  makeSystem,
  Namespace,
  queryBuilder,
  schemaTx,
  Long,
  Ref,
} from "../../src/schema/index.ts";

const User = Namespace("user", {
  name: attr(Schema.String, { unique: "identity", doc: "display name" }),
  age: attr(Long, { valueType: ":db.type/long" }),
  friends: attr(Ref, { cardinality: "many", valueType: ":db.type/ref" }),
});

const Movies = Catalog({ user: User });

describe("catalog constructors", () => {
  test("namespace stamps derivable idents", () => {
    expect(User.ns).toBe("user");
    expect(User.name.ident).toBe(":user/name");
    expect(User.attributes.name.ident).toBe(":user/name");
    expect(User.attributes.name.cardinality).toBe("one");
    expect(User.attributes.name.unique).toBe("identity");
    expect(User.attributes.friends.cardinality).toBe("many");
    expect(User.attributes.friends.ident).toBe(":user/friends");
  });

  test("schemaTx lowers to ident datom maps (separate ensure tx)", () => {
    expect(schemaTx(Movies)).toEqual([
      {
        ":db/ident": ":user/name",
        ":db/valueType": ":db.type/string",
        ":db/cardinality": ":db.cardinality/one",
        ":db/unique": ":db.unique/identity",
        ":db/index": true,
        ":db/doc": "display name",
      },
      {
        ":db/ident": ":user/age",
        ":db/valueType": ":db.type/long",
        ":db/cardinality": ":db.cardinality/one",
      },
      {
        ":db/ident": ":user/friends",
        ":db/valueType": ":db.type/ref",
        ":db/cardinality": ":db.cardinality/many",
      },
    ]);
  });
});

describe("typed create / connect", () => {
  const system = makeSystem({ url: "https://peer.example" });
  const run = <A, E>(eff: Effect.Effect<A, E, RuntimeContext>) =>
    Effect.runPromise(eff.pipe(Effect.provide(RuntimeContext.phantom)));

  test("invalid name is BadRequest, no network", async () => {
    const err = await Effect.runPromise(
      Effect.flip(system.create("bad/name", Movies)).pipe(
        Effect.provide(RuntimeContext.phantom),
      ),
    );
    expect(err._tag).toBe("BadRequest");
    expect(err.message).toContain("invalid database name");
  });

  test("valid name returns a client generic on the catalog", async () => {
    const db = await run(system.create("movies", Movies));
    expect(db.name).toBe("movies");
    expect(db.catalog).toBe(Movies);
    const again = await run(system.connect("movies", Movies));
    expect(again.catalog).toBe(Movies);
  });
});

describe("query builder", () => {
  test("where lowers attr refs to idents and keeps vars / blanks", () => {
    const q = queryBuilder(Movies)
      .where("?e", User.name, "?n")
      .where("?e", "_", "?v")
      .where("?e", "?a", 1)
      .options({ minT: 3 });
    expect(q.spec.where).toEqual([
      ["?e", ":user/name", "?n"],
      ["?e", "_", "?v"],
      ["?e", "?a", 1],
    ]);
    expect(q.spec.options).toEqual({ minT: 3 });
    expect(q.catalog).toBe(Movies);
  });
});
