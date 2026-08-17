/**
 * `@ripple/alchemy/db` — the portable half of Ripple.
 *
 * Schema, addressing, queries, transactions, pulls and the tagged errors, in
 * one flat namespace: `import * as Ripple from "@ripple/alchemy/db"`. It runs
 * in a browser, in a Worker, in Node/Bun and in a test.
 *
 * **Nothing reachable from this module imports `alchemy`** (the deploy engine)
 * or the `@ripple/core` barrel — that is what makes it browser-safe without a
 * bundler alias, and `test/db-portable.test.ts` fails the build if it ever
 * stops being true. The deploy-time surface (`System`, the capabilities, the
 * transport layers, `Policy`) lives in `@ripple/alchemy`.
 *
 * ```typescript
 * import * as Ripple from "@ripple/alchemy/db";
 * import * as Schema from "effect/Schema";
 *
 * export const Todo = Ripple.Namespace("todo", {
 *   title: Ripple.Attr(Schema.String),
 *   done: Ripple.Attr(Schema.Boolean),
 *   createdAt: Ripple.Attr(Ripple.Instant),
 * });
 * export const Todos = Ripple.Catalog({ todo: Todo });
 * ```
 */

// ── schema ─────────────────────────────────────────────────────────────────
export { Attr, type Attribute } from "./Attribute.ts";
export { Catalog } from "./Catalog.ts";
export { Namespace } from "./Namespace.ts";
export { Bytes, Instant, Long, Ref, Uuid, UuidString } from "./valueTypes.ts";

// ── addressing ─────────────────────────────────────────────────────────────
export { Eid } from "./Eid.ts";
export type { LookupRef } from "./idents.ts";

// ── reads ──────────────────────────────────────────────────────────────────
export type { Pull } from "./Pull.ts";
export type { Query, QueryBuilder } from "./Query.ts";

// ── writes ─────────────────────────────────────────────────────────────────
export type { Entity, Tx } from "./Tx.ts";

// ── errors ─────────────────────────────────────────────────────────────────
export {
  DatabaseNotFound,
  type DbError,
  InternalError,
  InvalidRequest,
  NetworkError,
  QueryBudgetExceeded,
  TxRejected,
  Unauthorized,
  Unavailable,
} from "./Errors.ts";

// ── in transit ─────────────────────────────────────────────────────────────
//
// The typed session client and its `live` store are what the browser has
// today; `layer` / `Databases` / `Db<C>` replace them (and delete every name
// below) in the client redesign. They are here — rather than on
// `@ripple/alchemy` — because a browser must be able to reach them without
// pulling the deploy engine.
export * as Session from "./Session.ts";
export type {
  LiveQuery,
  LiveQueryBuilder,
  LiveStore,
  TypedLiveDatabaseClient,
} from "./Live.ts";
