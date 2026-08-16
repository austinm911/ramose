/**
 * Effect-native schema catalog — typed interface proposal.
 *
 * A *new layer* on top of today's untyped `Ripple.System` / `create(name)` /
 * `ReadWriteDatabaseClient`. It does not rewrite the transactor, the
 * worker, replica, storage, or the existing client runtime. Methods that
 * would hit a peer are stubs; constructors, lowering, and the types are
 * real.
 *
 * ```ts
 * import * as Schema from "effect/Schema"
 * import { SchemaFx } from "@ripple/alchemy"
 *
 * const User = SchemaFx.Namespace("user", {
 *   name: SchemaFx.attr(Schema.String, { unique: "identity" }),
 * })
 * const Movies = SchemaFx.Catalog({ user: User })
 *
 * const system = SchemaFx.makeSystem({ url: "https://peer" })
 * const db = yield* system.create("movies", Movies)
 * yield* db.transact(function* (tx) {
 *   const ada = yield* tx.entity()
 *   yield* ada.add(User.name, "Ada")
 * })
 * const pulled = yield* db.pull(1001, { name: User.name, age: User.age.optional })
 * const rows = yield* db.q((q) => q.where("?e", User.name, "?n").find("?n"))
 * ```
 */

export * from "./Attribute.ts";
export * from "./Catalog.ts";
export * from "./Client.ts";
export * from "./ensure.ts";
export * from "./equal.ts";
export * from "./Errors.ts";
export * from "./idents.ts";
export * from "./Namespace.ts";
export * from "./Pull.ts";
export * from "./Query.ts";
export * from "./Read.ts";
export * from "./Tx.ts";
export * from "./valueTypes.ts";
