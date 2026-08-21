/**
 * The server half: the same fixtures compiled for SSR, rendered with no DOM
 * at all. Bare `octane` is aliased to `octane/server`, so the hooks the
 * binding imports are the server twins — the ones that never subscribe.
 */

import { resolve } from "node:path";
import { octane } from "octane/compiler/vite";
import { defineConfig } from "vitest/config";
import { ramoseAliases } from "./vitest.config.ts";

const repo = resolve(import.meta.dirname, "../..");

export default defineConfig({
  plugins: [octane({ ssr: true })],
  resolve: {
    alias: [{ find: /^octane$/, replacement: "octane/server" }, ...ramoseAliases],
  },
  test: {
    name: "ramose-octane-ssr",
    root: repo,
    include: ["test/octane/ssr/**/*.vitest.ts"],
    environment: "node",
    globals: false,
  },
});
