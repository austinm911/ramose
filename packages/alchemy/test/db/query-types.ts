/**
 * Compile-time fixtures for the catalog-generic query builder.
 *
 * `bun run typecheck` compiles this file. A mismatch turns `Expect<Equal<…>>`
 * into a type error, or leaves a `@ts-expect-error` unused.
 */

import * as Effect from "effect/Effect";
import type {
  Db,
  DbError,
  Eid,
  Equal,
  Expect,
  FindRows,
  Pull,
  ReadDb,
} from "../../src/db/internal.ts";

import { Movie, Movies, User } from "./fixture.ts";

declare const db: Db<typeof Movies>;

// ── find row type matches bound attr types ─────────────────────────────────

const nameRows = db.q((q) => q.where("?e", User.name, "?n").find("?n"));
type NameRows = Effect.Success<typeof nameRows>;
type _nameRow = Expect<Equal<NameRows, readonly [string][]>>;
type _nameErr = Expect<Equal<Effect.Error<typeof nameRows>, DbError>>;
/** Every signature's `R` is `never` — nothing is left for a caller to provide. */
type _nameR = Expect<Equal<Effect.Services<typeof nameRows>, never>>;

const identRows = db.q((q) => q.where("?e", ":user/name", "?n").find("?n"));
type _identRow = Expect<
  Equal<Effect.Success<typeof identRows>, readonly [string][]>
>;

const ageRows = db.q((q) => q.where("?e", User.age, "?a").find("?a"));
type _ageRow = Expect<Equal<Effect.Success<typeof ageRows>, readonly [number][]>>;

const eidAndName = db.q((q) => q.where("?e", User.name, "?n").find("?e", "?n"));
type EidNameRows = Effect.Success<typeof eidAndName>;
type EidCell = EidNameRows[number][0];
type NameCell = EidNameRows[number][1];
type _eidIsWrapper = Expect<Equal<EidCell, Eid<typeof Movies>>>;
type _eidNotNumber = Expect<Equal<EidCell extends number ? true : false, false>>;
type _nameStaysPrimitive = Expect<Equal<NameCell, string>>;
type _eidName = Expect<
  Equal<EidNameRows, readonly [Eid<typeof Movies>, string][]>
>;

// ── ref-attr value binding is an Eid, not number ───────────────────────────

const friendRows = db.q((q) => q.where("?e", User.friends, "?f").find("?f"));
type _friendEid = Expect<
  Equal<Effect.Success<typeof friendRows>, readonly [Eid<typeof Movies>][]>
>;

const identRefRows = db.q((q) => q.where("?e", ":user/friends", "?f").find("?f"));
type _identRefEid = Expect<
  Equal<Effect.Success<typeof identRefRows>, readonly [Eid<typeof Movies>][]>
>;

// ── `.pull` after a one-eid find ───────────────────────────────────────────

const pattern = {
  name: User.name,
  age: User.age.optional,
  friends: User.friends.select({ name: User.name }),
};
const pulledRows = db.q((q) =>
  q.where("?e", User.name, "_").find("?e").pull(pattern),
);
type PulledRows = Effect.Success<typeof pulledRows>;
type _pulledRow = Expect<
  Equal<
    PulledRows,
    readonly (readonly [Eid<typeof Movies>, Pull<typeof Movies, typeof pattern>])[]
  >
>;
type _pulledName = Expect<Equal<PulledRows[number][1]["name"], string>>;
type _pulledAge = Expect<
  Equal<PulledRows[number][1]["age"], number | undefined>
>;

// @ts-expect-error an attr outside the catalog fails ValidatePull
db.q((q) => q.where("?e", User.name, "_").find("?e").pull({ x: Movie.nope }));

// @ts-expect-error two vars: `.pull` needs exactly one entity var
db.q((q) => q.where("?e", User.name, "?n").find("?e", "?n").pull({ name: User.name }));

// @ts-expect-error a value var is not an entity var
db.q((q) => q.where("?e", User.name, "?n").find("?n").pull({ name: User.name }));

// ── explain keeps the rows and adds the plan ───────────────────────────────

const explained = db.q((q) => q.where("?e", User.name, "?n").explain("?n"));
type Explained = Effect.Success<typeof explained>;
type _explainRows = Expect<Equal<Explained["rows"], readonly [string][]>>;
type _explainPlan = Expect<Equal<Explained["explain"], readonly unknown[]>>;

// ── unknown attr in where is a type error ──────────────────────────────────

// @ts-expect-error unknown ident
db.q((q) => q.where("?e", ":user/nope", "?n").find("?n"));

// @ts-expect-error unknown ident string is not an attr slot
db.q((q) => q.where("?e", ":movie/director", "?d").find("?d"));

// ── wrong constant value type is a type error ──────────────────────────────

// @ts-expect-error name is string, not number
db.q((q) => q.where("?e", User.name, 42).find("?e"));

// @ts-expect-error year is number, not string
db.q((q) => q.where("?e", Movie.year, "2016").find("?e"));

// @ts-expect-error ident form: name is string, not number
db.q((q) => q.where("?e", ":user/name", 42).find("?e"));

// ── `_` and a variable in the attr slot are legal ──────────────────────────

const blankAttr = db.q((q) => q.where("?e", "_", "?v").find("?e", "?v"));
type _blankOk = Expect<
  Equal<
    Effect.Success<typeof blankAttr>,
    readonly [Eid<typeof Movies>, unknown][]
  >
>;

const varAttr = db.q((q) => q.where("?e", "?a", "?v").find("?e", "?a", "?v"));
type _varAttrOk = Expect<
  Equal<
    Effect.Success<typeof varAttr>,
    readonly [Eid<typeof Movies>, string, unknown][]
  >
>;

const blankVal = db.q((q) => q.where("?e", User.name, "_").find("?e"));
type _blankVal = Expect<
  Equal<Effect.Success<typeof blankVal>, readonly [Eid<typeof Movies>][]>
>;

// ── joining two clauses types both vars ────────────────────────────────────

const joined = db.q((q) =>
  q.where("?e", User.name, "?n").where("?e", User.age, "?age").find("?n", "?age"),
);
type _joined = Expect<
  Equal<Effect.Success<typeof joined>, readonly [string, number][]>
>;

const joinedMovie = db.q((q) =>
  q.where("?e", User.name, "?n").where("?m", Movie.title, "?t").find("?n", "?t"),
);
type _joinedMovie = Expect<
  Equal<Effect.Success<typeof joinedMovie>, readonly [string, string][]>
>;

// ── asOf / history compose, and have no write half ─────────────────────────

const asOf = db.asOf(3);
const hist = db.history;
type _asOfIsRead = Expect<Equal<typeof asOf, ReadDb<typeof Movies>>>;
type _histIsRead = Expect<Equal<typeof hist, ReadDb<typeof Movies>>>;
type _asOfNoWrite = Expect<
  Equal<"transact" extends keyof typeof asOf ? true : false, false>
>;

const asOfRows = asOf.q((q) => q.where("?e", User.name, "?n").find("?n"));
type _asOfRows = Expect<
  Equal<Effect.Success<typeof asOfRows>, readonly [string][]>
>;
const histRows = hist.q((q) => q.where("?e", User.name, "?n").find("?n"));
type _histRows = Expect<
  Equal<Effect.Success<typeof histRows>, readonly [string][]>
>;

// ── FindRows helper matches the Effect success ─────────────────────────────

type Bound = {
  readonly "?n": string;
  readonly "?e": Eid<typeof Movies>;
};
type _helper = Expect<
  Equal<
    FindRows<Bound, readonly ["?n", "?e"]>,
    readonly [string, Eid<typeof Movies>][]
  >
>;
