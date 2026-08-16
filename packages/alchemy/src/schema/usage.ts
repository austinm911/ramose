/**
 * Typechecked usage — the experience proof, not a markdown wish list.
 *
 * System → catalog → create → transact (generator) → q → eid.pull → asOf.
 * This file is compiled by `bun run typecheck`. It is not a runtime test
 * (create is real for the name check; everything past that is a stub).
 */

import type { RuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseError } from "../DatabaseTypes.ts";
import { Attr } from "./Attribute.ts";
import { Catalog } from "./Catalog.ts";
import { makeSystem } from "./Client.ts";
import { SchemaEnsureError } from "./Errors.ts";
import { Namespace } from "./Namespace.ts";
import { Long, Ref } from "./valueTypes.ts";

export const User = Namespace("user", {
  name: Attr(Schema.String, { unique: "identity" }),
  age: Attr(Long),
  friends: Attr(Ref, { cardinality: "many" }),
  bestFriend: Attr(Ref),
});

export const Movie = Namespace("movie", {
  title: Attr(Schema.String, { index: true }),
  year: Attr(Long),
});

/** Metadata namespace — attrs from here mix onto the same entity as User. */
export const Meta = Namespace("meta", {
  source: Attr(Schema.String),
});

export const Movies = Catalog({ user: User, movie: Movie, meta: Meta });

/**
 * The happy path an Effect-savvy caller writes: `yield*`, inferred
 * success, `catchTags` on the tagged channel. One entity is a bag —
 * User.name and Meta.source on the same handle. `ada.add` is the write;
 * `q` binds entity / ref vars as an Eid wrapper; `.pull` is a plain
 * object of those attr refs (keys are the names that come back).
 */
export const program = Effect.gen(function* () {
  const system = makeSystem({ url: "https://ripple.example.workers.dev" });
  const db = yield* system.create("movies", Movies);

  const ack = yield* db.transact(function* (tx) {
    const ada = yield* tx.entity();
    yield* ada.add(User.name, "Ada");
    yield* ada.add(User.age, 36);
    yield* ada.add(Meta.source, "import");
    yield* ada.retract(User.age, 35);

    const arrival = yield* tx.entity();
    yield* arrival.add(Movie.title, "Arrival");
    yield* arrival.add(Movie.year, 2016);
  });

  const rows = yield* db.q((q) =>
    q.where("?e", User.name, "?n").options({ minT: ack.t }).find("?e", "?n"),
  );
  // rows[0][0] is an Eid, not number
  const pulled = yield* rows[0][0].pull({
    name: User.name,
    age: User.age.optional,
    source: Meta.source,
    bestFriend: User.bestFriend.optional.with({
      name: User.name,
      age: User.age.optional,
    }),
    friends: User.friends.with({
      name: User.name,
      age: User.age.optional,
    }),
  });
  // name: string
  // age: number | undefined
  // bestFriend: { name: string; age: number | undefined } | undefined
  // friends: readonly { name: string; age: number | undefined }[]
  const requiredOnly = yield* rows[0][0].pull({ name: User.name });

  const before = db.asOf(ack.t - 1);
  const hist = db.history();
  const pastRows = yield* before.q((q) =>
    q.where("?e", User.name, "?n").find("?e"),
  );
  const past = yield* pastRows[0][0].pull({ name: User.name });

  return { ack, pulled, requiredOnly, rows, past, hist, catalog: db.catalog };
}).pipe(
  Effect.catchTags({
    BadRequest: (e) => Effect.succeed({ error: e._tag, message: e.message }),
    SchemaEnsureError: (e) =>
      Effect.succeed({ error: e._tag, message: e.message }),
    TxRejected: (e) => Effect.succeed({ error: e._tag, message: e.message }),
    TransactorDead: (e) => Effect.succeed({ error: e._tag, message: e.message }),
    QueryBudgetExceeded: (e) =>
      Effect.succeed({ error: e._tag, message: e.message }),
    Unauthorized: (e) => Effect.succeed({ error: e._tag, message: e.message }),
    NotFound: (e) => Effect.succeed({ error: e._tag, message: e.message }),
    Internal: (e) => Effect.succeed({ error: e._tag, message: e.message }),
    NetworkError: (e) => Effect.succeed({ error: e._tag, message: e.message }),
  }),
);

export type ProgramSuccess = Effect.Success<typeof program>;
export type ProgramError = Effect.Error<typeof program>;
export type ProgramServices = Effect.Services<typeof program>;

type _Runtime = ProgramServices extends RuntimeContext ? true : false;
type _NoLeftoverError = [ProgramError] extends [never] ? true : false;
type _HasDatabaseError = DatabaseError;
void 0 as unknown as [_Runtime, _NoLeftoverError, _HasDatabaseError];
