/**
 * `@ripple/alchemy/db` — the portable half of Ripple.
 *
 * Schema, connecting, the database and the tagged errors, in one flat
 * namespace: `import * as Ripple from "@ripple/alchemy/db"`. It runs in a
 * browser, in a Worker, in Node/Bun and in a test.
 *
 * **Nothing reachable from this module imports `alchemy`** (the deploy engine)
 * or the `@ripple/core` barrel — that is what makes it browser-safe without a
 * bundler alias, and `test/db-portable.test.ts` fails the build if it ever
 * stops being true. The deploy-time surface (`Server`, the capability, the
 * transport layers, `Policy`) lives in `@ripple/alchemy`.
 *
 * ```typescript
 * import * as Ripple from "@ripple/alchemy/db";
 * import * as Schema from "effect/Schema";
 *
 * export const Todo = Ripple.Namespace("todo", {
 *   title: Ripple.Attr(Schema.String),
 *   done: Ripple.Attr(Schema.Boolean),
 * });
 * export const Todos = Ripple.Catalog({ todo: Todo });
 *
 * const ripple = Ripple.connect({ url, token });
 * export const db = ripple.db("todos", Todos);
 * // Effect users: `Ripple.layer({ url, token })` is the same client as a
 * // scoped Layer<Databases>.
 * ```
 */

// ── schema ─────────────────────────────────────────────────────────────────
export { Attr, type Attribute } from "./Attribute.ts";
export { Catalog } from "./Catalog.ts";
export { Namespace } from "./Namespace.ts";
export { Bytes, Instant, Long, Ref, Uuid, UuidString } from "./valueTypes.ts";
export { not, or, query } from "./NavQuery.ts";
export type {
  EidLike,
  NavQuery,
  NavQueryBuilder,
  Not,
  Or,
  Predicate,
  Shape,
  WhereNode,
} from "./NavQuery.ts";

// ── connecting ─────────────────────────────────────────────────────────────
export {
  type Client,
  type ClientOptions,
  connect,
  Databases,
  layer,
} from "./Databases.ts";
export { type Claims, token, type TokenSource } from "./token.ts";
// the peer's database-name rule, so an app can validate a user-minted name
// (multi-tenant "create workspace") before the peer does — not a slugify
export { DATABASE_NAME_RE, isDatabaseName } from "./DatabaseName.ts";

// ── the database ───────────────────────────────────────────────────────────
export type { Db, ReadDb, TxReport } from "./Db.ts";
export type { Eid } from "./Eid.ts";
export type { LookupRef } from "./idents.ts";
export type { Pull } from "./Pull.ts";
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
