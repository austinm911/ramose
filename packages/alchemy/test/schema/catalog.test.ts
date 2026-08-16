/**
 * Runtime lowering: catalog → ident datoms, q clauses, tx ops. No peer I/O.
 */

import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  Attr,
  Catalog,
  Namespace,
  queryBuilder,
  schemaTx,
  txBuilder,
  lowerPullPattern,
  Long,
  Ref,
} from "../../src/schema/index.ts";

const User = Namespace("user", {
  name: Attr(Schema.String, { unique: "identity", doc: "display name" }),
  age: Attr(Long),
  friends: Attr(Ref, { cardinality: "many" }),
});

const Meta = Namespace("meta", {
  source: Attr(Schema.String),
});

const Movies = Catalog({ user: User, meta: Meta });

describe("schemaTx", () => {
  test("lowers to ident datom maps (separate ensure tx)", () => {
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
      {
        ":db/ident": ":meta/source",
        ":db/valueType": ":db.type/string",
        ":db/cardinality": ":db.cardinality/one",
      },
    ]);
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

describe("transaction builder", () => {
  test("entity is a bag: attrs from two namespaces lower to :db/add", () => {
    const tx = txBuilder(Movies);
    Effect.runSync(
      Effect.gen(function* () {
        const ada = yield* tx.entity();
        yield* ada.add(User.name, "Ada");
        yield* ada.add(User.age, 36);
        yield* ada.add(Meta.source, "import");
        yield* ada.retract(User.age, 35);
        yield* tx.add(1001, User.friends, 1002);
        yield* tx.retractEntity(1001);
        const byLookup = yield* tx.entity([User.name, "Ada"]);
        yield* byLookup.add(Meta.source, "lookup");
      }),
    );
    expect(tx.spec.ops).toEqual([
      [":db/add", "tmp-1", ":user/name", "Ada"],
      [":db/add", "tmp-1", ":user/age", 36],
      [":db/add", "tmp-1", ":meta/source", "import"],
      [":db/retract", "tmp-1", ":user/age", 35],
      [":db/add", 1001, ":user/friends", 1002],
      [":db/retractEntity", 1001],
      [":db/add", [":user/name", "Ada"], ":meta/source", "lookup"],
    ]);
    expect(tx.catalog).toBe(Movies);
  });
});


describe("pull lowering", () => {
  test("literate map becomes :as / nested AST the peer already accepts", () => {
    expect(
      lowerPullPattern({
        name: User.name,
        age: User.age.optional,
        friends: User.friends.with({ name: User.name }),
      }),
    ).toEqual([
      { kind: "attr", attr: ":user/name", reverse: false, as: "name" },
      { kind: "attr", attr: ":user/age", reverse: false, as: "age" },
      {
        kind: "attr",
        attr: ":user/friends",
        reverse: false,
        as: "friends",
        sub: [{ kind: "attr", attr: ":user/name", reverse: false, as: "name" }],
      },
    ]);
  });

  test("ident-keyed array stays ident strings", () => {
    expect(lowerPullPattern([User.name, ":user/age", "*"])).toEqual([
      ":user/name",
      ":user/age",
      "*",
    ]);
  });
});
