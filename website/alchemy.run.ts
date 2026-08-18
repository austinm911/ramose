/**
 * The docs site — an assets-only Cloudflare Worker built from the Astro
 * project in this directory (the same pattern alchemy.run uses for its own
 * website).
 *
 *   bun alchemy dev website/alchemy.run.ts      # astro dev via the sidecar
 *   bun alchemy deploy website/alchemy.run.ts   # build + deploy the $USER stage
 *   bun alchemy deploy website/alchemy.run.ts --stage prod
 *   bun alchemy destroy website/alchemy.run.ts
 *
 * The public site is https://ramose.ai.
 *
 * `ripple-docs` (Worker) and `ripple-website` (Alchemy app) are *pinned
 * physical names*, deliberately kept from the pre-rebrand deployment: renaming
 * them would mint a new Worker and orphan the live one, along with its state
 * and its workers.dev hostname. They are infrastructure identifiers, not brand
 * strings — the brand lives in the custom domain and the site content.
 *
 * `--stage prod` pins the Worker name to `ripple-docs` so the URL
 * https://ripple-docs.tvanhens.workers.dev stays stable across deploys
 * (and after CI cache eviction), and serves the site at https://ramose.ai:
 * the zone is onboarded in the Cloudflare account, and Alchemy manages the
 * DNS record and edge certificate. `RAMOSE_DOCS_DOMAIN` overrides the
 * hostname — on any stage, which is also how the domain-attach path is
 * tested without touching prod. Merges to master publish this stage via
 * `.github/workflows/docs-publish.yml`.
 *
 * No `main` is provided, so no Worker script is uploaded: Cloudflare's asset
 * layer answers every request, with Starlight's built 404.html serving misses.
 */

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Path from "node:path";
import { fileURLToPath } from "node:url";

// Anchor the build to this directory so the stack works from any cwd.
const here = Path.dirname(fileURLToPath(import.meta.url));

export const Website = Cloudflare.Website.StaticSite(
  "Website",
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    // `||` (not `??`): CI passes the variable through unconditionally, so an
    // unset GitHub variable arrives as "" and must still mean "the default".
    const domain =
      process.env.RAMOSE_DOCS_DOMAIN || (stage === "prod" ? "ramose.ai" : undefined);
    return {
      cwd: here,
      command: "bun run build",
      outdir: "dist",
      compatibility: { date: "2025-06-01" as const },
      assets: { notFoundHandling: "404-page" as const },
      dev: { command: "bun run dev", url: "http://localhost:4321" },
      // Stable physical name on prod only — preview stages keep Alchemy's
      // per-stage name so `pr-<n>` Workers never collide with production.
      // `ripple-docs` is pinned pre-rebrand infrastructure; do not rename.
      ...(stage === "prod" ? { name: "ripple-docs" } : {}),
      ...(domain ? { domain } : {}),
    };
  }),
);

export default Alchemy.Stack(
  // Pinned physical app name (pre-rebrand); renaming it would strand the
  // existing stack state. The public site is https://ramose.ai.
  "ripple-website",
  {
    providers: Cloudflare.providers(),
    state: process.env.ALCHEMY_STATE === "local" ? Alchemy.localState() : Cloudflare.state(),
  },
  Effect.gen(function* () {
    const website = yield* Website;
    return { url: website.url };
  }),
);
