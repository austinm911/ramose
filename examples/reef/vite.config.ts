import { fileURLToPath } from "node:url";
import stylex from "@stylexjs/unplugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * StyleX compiles at build time via the official unplugin (kept ahead of the
 * React plugin to preserve Fast Refresh); the generated CSS is appended to
 * the one CSS asset `src/index.css` guarantees.
 *
 * `/api` is proxied to the auth Worker so Better Auth cookies stay
 * same-origin in dev — in production the same Worker serves these built
 * assets, so the paths line up with no proxy at all.
 */
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [stylex.vite({ useCSSLayers: true }), react()],
  server: {
    proxy: {
      "/api": {
        target: process.env.REEF_API_URL ?? "http://localhost:1338",
      },
    },
  },
});
