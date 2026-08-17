/**
 * Reef — the flagship Ripple demo. A multi-tenant, real-time issue tracker:
 * every workspace is its own Ripple database, Better Auth (organizations +
 * JWKS-published JWTs) is the identity plane, and the compiled policy on the
 * peer enforces admin / member / viewer per datom.
 *
 * Local dev (see .cursor/CLOUD.md for the env vars miniflare needs):
 *
 *   CI=1 ALCHEMY_STATE=local \
 *   CLOUDFLARE_ACCOUNT_ID=0123456789abcdef0123456789abcdef CLOUDFLARE_API_TOKEN=x \
 *     bun alchemy dev examples/reef/alchemy.run.ts
 *   bunx vite examples/reef            # UI on http://localhost:5173
 *
 * The peer serves http://localhost:1337, the auth Worker http://localhost:1338;
 * Vite proxies /api to the auth Worker so cookies stay same-origin.
 *
 * Deploy: `bun alchemy deploy examples/reef/alchemy.run.ts`, then
 * `VITE_RIPPLE_URL=<peerUrl> bunx vite build examples/reef` and deploy once
 * more so the built SPA ships as the auth Worker's assets.
 */

import * as Ripple from "@ripple/alchemy";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Api } from "./api.ts";
import { Server } from "./resources.ts";

export default Alchemy.Stack(
  "ripple-reef",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Ripple.providers()),
    state:
      process.env.ALCHEMY_STATE === "local"
        ? Alchemy.localState()
        : Cloudflare.state(),
  },
  Effect.gen(function* () {
    const api = yield* Api;
    const server = yield* Server;
    return { apiUrl: api.url, peerUrl: server.url };
  }),
);
