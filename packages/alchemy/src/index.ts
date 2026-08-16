/**
 * `@ripple/alchemy` — the Alchemy 2 + Effect interface to Ripple.
 *
 * ```typescript
 * import * as Alchemy from "alchemy";
 * import * as Cloudflare from "alchemy/Cloudflare";
 * import * as Ripple from "@ripple/alchemy";
 * import * as Layer from "effect/Layer";
 *
 * export const Peer = Cloudflare.Worker("Peer", { main: "./packages/worker/src/index.ts", env: { … } });
 * export const Movies = Ripple.Database("Movies", { peer: Peer, name: "movies" });
 *
 * export default Alchemy.Stack("app", {
 *   providers: Layer.mergeAll(Cloudflare.providers(), Ripple.providers()),
 *   state: Cloudflare.state(),
 * }, Effect.gen(function* () {
 *   const movies = yield* Movies;
 *   return { databaseUrl: movies.databaseUrl };
 * }));
 * ```
 */

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
  ReadWriteDatabaseClient,
  TxAck,
  WriteDatabaseClient,
} from "./Client.ts";
export * from "./Database.ts";
export * from "./DatabaseBinding.ts";
export * from "./DatabaseHttp.ts";
export * from "./DatabaseLocal.ts";
export * from "./DatabaseTypes.ts";
export * from "./Providers.ts";
export * from "./ReadDatabase.ts";
export * from "./ReadDatabaseBinding.ts";
export * from "./ReadDatabaseHttp.ts";
export * from "./ReadDatabaseLocal.ts";
export * from "./ReadWriteDatabase.ts";
export * from "./ReadWriteDatabaseBinding.ts";
export * from "./ReadWriteDatabaseHttp.ts";
export * from "./ReadWriteDatabaseLocal.ts";
export * from "./WriteDatabase.ts";
export * from "./WriteDatabaseBinding.ts";
export * from "./WriteDatabaseHttp.ts";
export * from "./WriteDatabaseLocal.ts";
