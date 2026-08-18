// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://ripplegraph.ai",
  integrations: [
    starlight({
      title: "ripplegraph.ai",
      description:
        "Ripple — an immutable, reactive graph database for Cloudflare. Changes ripple. Agents respond. State stays coherent.",
      favicon: "/favicon.svg",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/tvanhens/ripple",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/tvanhens/ripple/edit/master/website/",
      },
      customCss: [
        "@fontsource-variable/manrope",
        "./src/styles/theme.css",
      ],
      components: {
        SiteTitle: "./src/components/SiteTitle.astro",
        ThemeProvider: "./src/components/ThemeProvider.astro",
        ThemeSelect: "./src/components/ThemeSelect.astro",
      },
      expressiveCode: {
        themes: ["github-dark"],
        styleOverrides: {
          borderRadius: "0.5rem",
          borderColor: "var(--sl-color-gray-5)",
          frames: {
            editorBackground: "#0b0b09",
            terminalBackground: "#0b0b09",
            terminalTitlebarBackground: "#11110e",
            editorTabBarBackground: "#11110e",
          },
          codeBackground: "#0b0b09",
        },
      },
      sidebar: [
        {
          label: "Getting started",
          items: [
            { label: "Introduction", slug: "getting-started/introduction" },
            { label: "Quickstart", slug: "getting-started/quickstart" },
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "Architecture", slug: "concepts/architecture" },
            { label: "A database is a name", slug: "concepts/databases-are-names" },
            { label: "Time travel", slug: "concepts/time-travel" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Define a catalog", slug: "guides/catalog" },
            { label: "Transact", slug: "guides/transactions" },
            { label: "Query and pull", slug: "guides/queries" },
            { label: "Live queries", slug: "guides/live-queries" },
            { label: "Workers and tenants", slug: "guides/workers" },
            { label: "Deploy with Alchemy", slug: "guides/deploy" },
            { label: "Auth and policy", slug: "guides/auth" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Client API", slug: "reference/client-api" },
            { label: "React", slug: "reference/react" },
            { label: "Alchemy resources", slug: "reference/alchemy-resources" },
            { label: "HTTP API", slug: "reference/http-api" },
            { label: "Errors", slug: "reference/errors" },
            { label: "Configuration", slug: "reference/configuration" },
            { label: "Runbook", slug: "reference/runbook" },
          ],
        },
      ],
    }),
  ],
});
