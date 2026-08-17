# ripplegraph.ai — the docs site

The static documentation site for Ripple: [Astro](https://astro.build) +
[Starlight](https://starlight.astro.build), branded per the ripplegraph.ai
brand guide (warm white on void black, signal moss as the one accent, Manrope
as the Avenir Next web fallback), deployed to Cloudflare with Alchemy — the
same pattern [alchemy.run](https://alchemy.run) uses for its own website.

## Develop

```sh
bun install            # once, at the repo root (website is a workspace)
cd website
bun run dev            # astro dev on http://localhost:4321
```

## Build

```sh
bun run build          # static output in website/dist
bun run preview        # serve the built site locally
```

## Deploy

An assets-only Cloudflare Worker via `alchemy.run.ts` (no server bundle —
Cloudflare's asset layer serves every request, with Starlight's 404.html for
misses):

```sh
bun alchemy deploy website/alchemy.run.ts               # $USER stage
bun alchemy deploy website/alchemy.run.ts --stage prod  # production
bun alchemy destroy website/alchemy.run.ts              # tear a stage down
```

Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (see
`CONTRIBUTING.md`).

PRs that touch `website/` get an automatic preview deployment (stage
`pr-<number>`) with the URL commented on the PR; the preview is destroyed when
the PR closes. See `.github/workflows/docs-preview.yml` and the "Docs
previews" section of `CONTRIBUTING.md`.

## Layout

| path | contents |
| --- | --- |
| `src/content/docs/` | all pages (Markdown/MDX); `index.mdx` is the landing page |
| `src/styles/theme.css` | the brand theme mapped onto Starlight variables |
| `src/components/` | `SiteTitle` (lockup), `ThemeProvider`/`ThemeSelect` (dark-only) |
| `src/assets/ripple-mark.svg` | the symbol (one path, one ripple) |
| `public/favicon.svg` | micro-use mark (loop only, per the brand guide) |
| `astro.config.mjs` | Starlight config: sidebar, edit links, code theme |
| `alchemy.run.ts` | the Cloudflare deploy stack |
