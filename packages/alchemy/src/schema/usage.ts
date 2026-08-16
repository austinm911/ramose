/**
 * Typechecked usage — the experience proof, not a markdown wish list.
 *
 * System → catalog → create → transact → entity / pull / q → asOf.
 * This file is compiled by `bun run typecheck`. It is not a runtime test
 * (create is real for the name check; everything past that is a stub).
 */

import type { RuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { DatabaseError } from "../DatabaseTypes.ts";
import { attr } from "./Attribute.ts";
import { Catalog } from "./Catalog.ts";
import { makeSystem } from "./Client.ts";
import { SchemaEnsureError } from "./Errors.ts";
import { Namespace } from "./Namespace.ts";
import { Long, Ref } from "./valueTypes.ts";

export const User = Namespace("user", {
  name: attr(Schema.String, { unique: "identity" }),
  age: attr(Long, { valueType: ":db.type/long" }),
  friends: attr(Ref, { cardinality: "many", valueType: ":db.type/ref" }),
});

export const Movie = Namespace("movie", {
  title: attr(Schema.String, { index: true }),
  year: attr(Long, { valueType: ":db.type/long" }),
});

export const Movies = Catalog({ user: User, movie: Movie });

/**
 * The happy path an Effect-savvy caller writes: `yield*`, inferred
 * success, `catchTags` on the tagged channel.
 */
export const program = Effect.gen(function* () {
  const system = makeSystem({ url: "https://ripple.example.workers.dev" });
  const db = yield* system.create("movies", Movies);

  const ack = yield* db.transact([
    { user: { name: "Ada", age: 36 } },
    { movie: { title: "Arrival", year: 2016 } },
    [":db/add", "ada", ":user/name", "Ada"],
  ]);

  const ada = yield* db.entity(1001);
  const pulled = yield* db.pull(1001, [":user/name", ":user/age"]);
  const rows = yield* db.q((q) =>
    q.where("?e", User.name, "?n").options({ minT: ack.t }).find("?n"),
  );

  const before = db.asOf(ack.t - 1);
  const hist = db.history();
  const past = yield* before.entity(1001);

  return { ack, ada, pulled, rows, past, hist, catalog: db.catalog };
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
