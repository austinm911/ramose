/**
 * Runtime constructors and schema lowering. No peer I/O.
 */

import { describe, expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RuntimeContext } from "alchemy/RuntimeContext";
import {
  Attr,
  Catalog,
  Eid,
  isEid,
  makeSystem,
  Namespace,
  isPullNested,
  isPullOptional,
  pick,
  queryBuilder,
  schemaTx,
  txBuilder,
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

describe("catalog constructors", () => {
  test("namespace stamps derivable idents", () => {
    expect(User.ns).toBe("user");
    expect(User.name.ident).toBe(":user/name");
    expect(User.attributes.name.ident).toBe(":user/name");
    expect(User.attributes.name.cardinality).toBe("one");
    expect(User.attributes.name.unique).toBe("identity");
    expect(User.attributes.friends.cardinality).toBe("many");
    expect(User.attributes.friends.ident).toBe(":user/friends");
    expect(User.age.valueType).toBe(":db.type/long");
    expect(User.friends.valueType).toBe(":db.type/ref");
    expect(User.name.valueType).toBe(":db.type/string");
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
      {
        ":db/ident": ":meta/source",
        ":db/valueType": ":db.type/string",
        ":db/cardinality": ":db.cardinality/one",
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

describe("literate pull constructors", () => {
  test("attr.optional / attr.with are tagged field specs", () => {
    expect(isPullOptional(User.age.optional)).toBe(true);
    expect(User.age.optional.field.ident).toBe(":user/age");

    const friends = User.friends.with({
      name: User.name,
      age: User.age.optional,
    });
    expect(isPullNested(friends)).toBe(true);
    expect(friends.attr.ident).toBe(":user/friends");
    expect(isPullOptional(friends.pattern.age)).toBe(true);

    const maybeBest = User.friends.optional.with({ name: User.name });
    expect(isPullOptional(maybeBest)).toBe(true);
    expect(isPullNested(maybeBest.field)).toBe(true);
  });

  test("pick is a plain fields object, not a Struct wrap", () => {
    const picked = pick(User, "name", "age");
    expect(picked.name.ident).toBe(":user/name");
    expect(picked.age.ident).toBe(":user/age");
    expect("_tag" in picked).toBe(false);
  });
});

describe("eid wrapper", () => {
  test("Eid.of wraps a known number", () => {
    const eid = Eid.of(Movies, 1001);
    expect(isEid(eid)).toBe(true);
    expect(eid._tag).toBe("Eid");
    expect(eid.id).toBe(1001);
    expect(eid.catalog).toBe(Movies);
    expect(typeof eid.pull).toBe("function");
  });
});

