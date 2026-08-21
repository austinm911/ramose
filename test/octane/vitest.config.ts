/**
 * The client half of the `ramose/octane` suite: TSRX fixtures compiled by
 * Octane's own Vite plugin, mounted into happy-dom.
 *
 * Two things are deliberate here.
 *
 * `octane/compiler/vite` is the plugin, not `@octanejs/vite-plugin` — the
 * latter is the application integration (routing, SSR entry, hydration) and
 * peer-requires `vite@^8`, while this is the same compiler plugin Octane's
 * own binding packages use for their tests.
 *
 * The suite lives at the repo root, not under `packages/ramose/test`, because
 * `bun run test` globs that directory and Bun cannot compile `.tsrx`. The
 * `.vitest.ts` suffix keeps a bare `bun test` (`bun run test:all`) from
 * discovering these files either — Bun's discovery only matches
 * `*.test.*` / `*.spec.*`.
 */

import { resolve } from "node:path";
import { octane } from "octane/compiler/vite";
import { defineConfig } from "vitest/config";

const repo = resolve(import.meta.dirname, "../..");
const src = (path: string): string =>
  resolve(repo, "packages/ramose/src", path);

/**
 * The package's own subpaths, resolved to source: `exports` sends `types` to
 * `dist/*.d.ts`, so without these the suite would test the last build rather
 * than the working tree.
 */
export const ramoseAliases = [
  { find: /^ramose\/octane$/, replacement: src("octane/index.ts") },
  { find: /^ramose\/db$/, replacement: src("db/index.ts") },
];

export default defineConfig({
  plugins: [octane()],
  resolve: { alias: ramoseAliases },
  test: {
    name: "ramose-octane",
    root: repo,
    include: ["test/octane/**/*.vitest.ts"],
    exclude: ["test/octane/ssr/**"],
    environment: "happy-dom",
    globals: false,
    setupFiles: [resolve(import.meta.dirname, "setup.ts")],
    // `@octanejs/testing-library` publishes TypeScript source, which Node
    // refuses to type-strip inside node_modules — Vite has to transform it.
    server: { deps: { inline: ["@octanejs/testing-library"] } },
  },
});
