import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repo = (path: string) =>
  fileURLToPath(new URL(`../../${path}`, import.meta.url));

// `@ripple/alchemy` is TS source and its barrel pulls the deploy engine, so the
// browser gets the schema entry (and `@ripple/core`) directly.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "@ripple/alchemy/schema": repo("packages/alchemy/src/schema/index.ts"),
      "@ripple/core": repo("packages/core/src/index.ts"),
    },
  },
});
