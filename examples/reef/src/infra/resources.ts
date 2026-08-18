/**
 * The Ripple deployment for Reef: the peer Worker (R2 + Transactor DO +
 * QueryReplica DO) with the compiled workspace policy armed, and the
 * `Ripple.Server` resource on top of it.
 *
 * Auth wiring (docs/AUTH_LAYER.md §4 "Alchemy" seam):
 *
 *   RIPPLE_POLICY           domain/policy.ts, compiled to wire JSON at deploy
 *   RIPPLE_JWKS_URL         the auth Worker's Better Auth JWKS endpoint —
 *                           an `Output.interpolate` over `Api.url`, which is
 *                           the one edge between the two Workers (the auth
 *                           Worker needs nothing back, so the graph is a DAG)
 *   RIPPLE_JWT_ISS/_AUD     REEF_AUTH — the one AuthConfig the jwt plugin
 *   RIPPLE_JWT_MAX_TTL      and the mint route (`Ripple.claims`) also read,
 *                           so the cap equals the minted lifetime exactly
 *   RIPPLE_ALLOWED_ORIGINS  the Vite dev origin + the deployed SPA origin
 *                           (the auth Worker serves the built assets)
 *
 * `authEnv` also mints the Worker→DO internal secret a configured policy
 * arms. The Output-valued keys can't go through `authEnv` (it normalises
 * strings), so they are spelled directly with their `AUTH_ENV_KEYS` names.
 */

import * as Ripple from "@ripple/alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import { Api } from "./api.ts";
import { compiledPolicy } from "../domain/policy.ts";
import {
  AUTH_BASE_PATH,
  DEV_PEER_PORT,
  DEV_UI_ORIGIN,
  REEF_AUTH,
} from "../domain/shared.ts";

const Store = Cloudflare.R2.Bucket("Store");
const Transactor = Cloudflare.DurableObject("TransactorDO", { className: "TransactorDO" });
const Replica = Cloudflare.DurableObject("QueryReplicaDO", { className: "QueryReplicaDO" });

export const RippleWorker = Cloudflare.Worker("Peer", {
  main: "./packages/worker/src/index.ts",
  compatibility: { date: "2026-03-17", flags: ["nodejs_compat"] },
  dev: { port: DEV_PEER_PORT },
  env: {
    STORE: Store,
    TRANSACTOR: Transactor,
    REPLICA: Replica,
    ...Ripple.authEnv({
      policy: compiledPolicy(),
      auth: REEF_AUTH,
      internalSecret: process.env.RIPPLE_INTERNAL_SECRET,
    }),
    // Yielding the Api declaration registers (or reuses) the Worker in the
    // stack and hands back the resource whose attributes are Outputs — the
    // interpolation is then resolved by the engine at reconcile.
    [Ripple.AUTH_ENV_KEYS.jwksUrl]: Effect.map(
      Api,
      (api) => Output.interpolate`${api.url}${AUTH_BASE_PATH}/jwks`,
    ),
    [Ripple.AUTH_ENV_KEYS.allowedOrigins]: Effect.map(
      Api,
      (api) => Output.interpolate`${DEV_UI_ORIGIN},${api.url}`,
    ),
  },
});

/**
 * The server resource: resolves the peer's URL and (on a live deploy) proves
 * it answers `/health`. No `Ripple.Database` anywhere — a workspace database
 * is created at runtime, by the browser, with `db.install()` under its
 * creator's admin-class JWT.
 */
export const Server = Ripple.Server("Ripple", { worker: RippleWorker });
