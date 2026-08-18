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
 * `--stage prod` pins the Worker name to `ripple-docs` so the URL
 * https://ripple-docs.tvanhens.workers.dev stays stable across deploys
 * (and after CI cache eviction). Set `RIPPLE_DOCS_DOMAIN` to attach a
 * custom domain; the zone must already exist in the account. Merges to
 * master publish this stage via `.github/workflows/docs-publish.yml`.
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
    const domain = process.env.RIPPLE_DOCS_DOMAIN;
    return {
      cwd: here,
      command: "bun run build",
      outdir: "dist",
      compatibility: { date: "2025-06-01" as const },
      assets: { notFoundHandling: "404-page" as const },
      dev: { command: "bun run dev", url: "http://localhost:4321" },
      // Stable physical name on prod only — preview stages keep Alchemy's
      // per-stage name so `pr-<n>` Workers never collide with production.
      ...(stage === "prod" ? { name: "ripple-docs" } : {}),
      ...(stage === "prod" && domain ? { domain } : {}),
    };
  }),
);

export default Alchemy.Stack(
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
