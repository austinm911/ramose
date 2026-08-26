/**
 * `ramose/db` — the portable half of Ramose.
 *
 * Schema, connecting, the database and the tagged errors, in one flat
 * namespace: `import * as Ramose from "ramose/db"`. It runs in a
 * browser, in a Worker, in Node/Bun and in a test.
 *
 * **Nothing reachable from this module imports `alchemy`** (the deploy engine)
 * or the engine barrel (`src/internal/core/index.ts`) — that is what makes it
 * browser-safe without a
 * bundler alias, and `test/db-portable.test.ts` fails the build if it ever
 * stops being true. The deploy-time surface (`Server`, the capability, the
 * transport layers, `Policy`) lives in `ramose`.
 *
 * ```typescript
 * import * as Ramose from "ramose/db";
 *
 * export const Todo = Ramose.Entity("todo", {
 *   title: Ramose.string(),
 *   done: Ramose.boolean(),
 *   createdAt: Ramose.timestamp(),
 * });
 * export const Todos = Ramose.Schema({ todo: Todo });
 *
 * const ramose = Ramose.connect({ url, token });
 * export const db = ramose.db("todos", Todos);
 * // Effect users: `db.effect.query` / `import { layer } from "ramose/db/effect"`.
 * // Advanced schemas: `Ramose.Field(schema)` still accepts a raw Effect Schema;
 * // wrap with `stored(schema, vt)` when inference cannot name `:db.type/*`.
 * ```
 */
// ── schema ─────────────────────────────────────────────────────────────────
export { Enum, Field, Ref, boolean, bytes, float, int, string, timestamp, uuid, } from "./Field.js";
export { Schema } from "./Schema.js";
export { Entity } from "./Entity.js";
export { Bytes, Instant, Long, Uuid, stored, } from "./valueTypes.js";
// `Ramose.all(Todo)` — the wildcard pull, as a select shape, a nested
// `ref.select(all(N))`, or a pull pattern
export { all } from "./Pull.js";
// `Ramose.again(n)` — re-apply the enclosing select on a self-ref, n hops
export { again } from "./Pull.js";
// `Ramose.pick(User, "name", "age")` — same-entity field subset for a shape
export { pick } from "./Pull.js";
// `Ramose.values(attr, { where, limit, offset })` — a card-many scalar
// collection with pull-phase constraints; refs take the same record in
// `.select(shape, opts)`
export { values } from "./shapes.js";
// ── the query language (fluent + kernel) ───────────────────────────────────
// `Q` is the kernel (fact, comparisons, or/not, projections); `Query` is
// the constructor. App spelling: `Query.from(Issue).where({…}).orderBy(…)`.
// `Query.q` remains the generator-tier constructor.
export { Q } from "./query/index.js";
export * as Query from "./query/surface.js";
// ── connecting ─────────────────────────────────────────────────────────────
export { connect, } from "./connect.js";
export { token, } from "./token.js";
// the peer's database-name rule, so an app can validate a user-minted name
// (multi-tenant "create workspace") before the peer does — not a slugify
export { DATABASE_NAME_RE, isDatabaseName } from "./DatabaseName.js";
// entity / field name rule — definition-time, like DATABASE_NAME_RE
export { IDENT_NAME_RE, RESERVED_FIELD_KEYS, isIdentName, isReservedFieldKey, } from "./IdentName.js";
export { tempid } from "./entityArg.js";
// ── operations ─────────────────────────────────────────────────────────────
export { EntityId, Operation, Operations, PrefixHalt, checkOperationsCoverage, defineOperations, operationCards, operationNames, } from "./Operation.js";
// ── errors ─────────────────────────────────────────────────────────────────
export { DatabaseNotFound, InternalError, InvalidRequest, isDatabaseError, NetworkError, NotOne, OperationRejected, OperationsCoverageError, IncompatibleSchema, PolicyError, QueryBudgetExceeded, TxRejected, Unauthorized, Unavailable, } from "./Errors.js";
//# sourceMappingURL=index.js.map