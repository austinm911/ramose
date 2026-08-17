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

export const Website = Cloudflare.Website.StaticSite("Website", {
  cwd: here,
  command: "bun run build",
  outdir: "dist",
  compatibility: { date: "2025-06-01" },
  assets: { notFoundHandling: "404-page" },
  dev: { command: "bun run dev", url: "http://localhost:4321" },
});

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
