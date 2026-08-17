/**
 * `@ripple/alchemy` — the Alchemy 2 + Effect interface to Ripple.
 *
 * Everything on `@ripple/alchemy/db` (schema, queries, transactions, pulls,
 * errors), plus the deploy-time half: the `System` resource, the capabilities,
 * the transport layers and typed policy.
 *
 * ```typescript
 * import * as Alchemy from "alchemy";
 * import * as Cloudflare from "alchemy/Cloudflare";
 * import * as Ripple from "@ripple/alchemy";
 * import * as Schema from "effect/Schema";
 * import * as Layer from "effect/Layer";
 *
 * export const User = Ripple.Namespace("user", {
 *   name: Ripple.Attr(Schema.String, { unique: "identity" }),
 * });
 * export const Movies = Ripple.Catalog({ user: User });
 *
 * export const Peer = Cloudflare.Worker("Peer", { main: "./packages/worker/src/index.ts", env: { … } });
 * export const Sys = Ripple.System("Sys", { peer: Peer });
 *
 * export default Alchemy.Stack("app", {
 *   providers: Layer.mergeAll(Cloudflare.providers(), Ripple.providers()),
 *   state: Cloudflare.state(),
 * }, Effect.gen(function* () {
 *   const system = Ripple.fromReadWrite(yield* Ripple.ReadWriteSystem(Sys));
 *   const movies = yield* system.create("movies", Movies);
 *   yield* movies.transact(function* (tx) {
 *     const ada = yield* tx.entity();
 *     yield* ada.add(User.name, "Ada");
 *   });
 * }));
 * ```
 */

// ── the portable half, verbatim ────────────────────────────────────────────
export * from "./db/index.ts";

// ── typed policy: deploy-time, so it is not on `/db` ────────────────────────
export * as Policy from "./db/Policy.ts";
export { PolicyError, SchemaEnsureError } from "./db/SchemaErrors.ts";

// ── still standing; the client redesign is the next slice ──────────────────
export {
  fromRead,
  fromReadWrite,
  fromWrite,
  type IoError,
  type OpenError,
  type TypedReadDatabaseClient,
  type TypedReadSystemClient,
  type TypedReadWriteDatabaseClient,
  type TypedReadWriteSystemClient,
  type TypedWriteDatabaseClient,
  type TypedWriteSystemClient,
} from "./db/Client.ts";
export * as Client from "./Client.ts";
export type {
  DatabaseEndpoint,
  DatabaseHealth,
  DatabaseSource,
  FetchLike,
  QueryMeta,
  QueryOptions,
  QueryResponse,
  ReadDatabaseClient,
  ReadSystemClient,
  ReadWriteDatabaseClient,
  ReadWriteSystemClient,
  SystemEndpoint,
  SystemSource,
  TxAck,
  WriteDatabaseClient,
  WriteSystemClient,
} from "./Client.ts";
// `Session` is the typed-session namespace re-exported from `./db/index.ts`;
// the raw socket keeps its own, unnamespaced exports.
export {
  openSession,
  sessionUrl,
  type SessionOptions,
  type WebSocketLike,
} from "./Session.ts";

// ── resource, capabilities, transports ─────────────────────────────────────
export * from "./Providers.ts";
export * from "./ReadSystem.ts";
export * from "./ReadSystemBinding.ts";
export * from "./ReadSystemHttp.ts";
export * from "./ReadSystemLocal.ts";
export * from "./ReadWriteSystem.ts";
export * from "./ReadWriteSystemBinding.ts";
export * from "./ReadWriteSystemHttp.ts";
export * from "./ReadWriteSystemLocal.ts";
export * from "./System.ts";
// `SystemBinding.ts` / `SystemHttp.ts` / `SystemLocal.ts` / `SystemRuntime.ts`
// are capability-internal scaffolding and are deliberately NOT re-exported
// (mirrors `alchemy/Cloudflare/KV/index.ts`).
export * from "./WriteSystem.ts";
export * from "./WriteSystemBinding.ts";
export * from "./WriteSystemHttp.ts";
export * from "./WriteSystemLocal.ts";
