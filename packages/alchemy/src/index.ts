/**
 * `@ripple/alchemy` — the Alchemy 2 + Effect interface to Ripple.
 *
 * Everything on `@ripple/alchemy/db` (schema, `Databases`, `Db<C>`, the eight
 * errors), plus the deploy-time half: the `Server` and `Database` resources,
 * the two capabilities and the two transport layers.
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
 * const RippleWorker = Cloudflare.Worker("RippleWorker", { main: "@ripple/worker" });
 * export const Server = Ripple.Server("Ripple", { worker: RippleWorker });
 * export const MoviesDb = Ripple.Database("movies", { server: Server, catalog: Movies });
 *
 * export default Alchemy.Stack("app", {
 *   providers: Layer.mergeAll(Cloudflare.providers(), Ripple.providers()),
 *   state: Cloudflare.state(),
 * }, Effect.gen(function* () {
 *   yield* MoviesDb;
 * }));
 * ```
 */

// ── the portable half, verbatim ────────────────────────────────────────────
export * from "./db/index.ts";

// ── typed policy: deploy-time, so it is not on `/db` ────────────────────────
export * as Policy from "./db/Policy.ts";

// ── the verifier/minter contract ─────────────────────────────────────────
// (`MintedClaims`, not `Claims`: the portable barrel already exports `Claims`
// as the decoded-but-unverified payload of a `TokenSource` — same shape,
// different trust level — and a shadow would silently change its meaning.)
export { type AuthConfig, claims, type ClaimsInput, type MintedClaims } from "./Auth.ts";

// ── resources ──────────────────────────────────────────────────────────────
export { Database } from "./Database.ts";
export {
  AUTH_ENV_KEYS,
  authEnv,
  DEFAULT_JWT_MAX_TTL,
  internalSecret,
  type PeerAuth,
  Server,
} from "./Server.ts";

// ── capabilities and transports ────────────────────────────────────────────
export { ReadDatabases } from "./ReadDatabases.ts";
export { ReadWriteDatabases } from "./ReadWriteDatabases.ts";
export { ServerBinding } from "./ServerBinding.ts";
export { ServerHttp } from "./ServerHttp.ts";
export { providers, Providers } from "./Providers.ts";

// `ServerRuntime.ts` and `Source.ts` are internal scaffolding and are
// deliberately NOT re-exported (mirrors `alchemy/Cloudflare/KV/index.ts`):
// HTTP is Worker internals, not a second public API.
