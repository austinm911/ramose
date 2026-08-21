/**
 * The public hostname for the deployed demo, and the physical names that go
 * with it. Both are opt-in: `REEF_DOMAIN` is set only by the production
 * publish (`.github/workflows/reef-publish.yml`), so a personal
 * `alchemy deploy` or `alchemy dev` is byte-for-byte what it was before.
 *
 * Why the names are pinned when the domain is set: CI carries `.alchemy/`
 * in the Actions cache rather than a remote state store (see CONTRIBUTING.md
 * — the CI token deliberately lacks the scopes `Cloudflare.state()` needs).
 * Alchemy's generated names carry a random suffix, so a cache eviction would
 * mint a *new* D1 and R2 and orphan the live ones — with them every account
 * and every workspace's data. Pinned names make `--adopt` reattach the
 * existing resources instead. This matters far more here than for the docs
 * site, which is assets-only and has nothing to lose.
 *
 * `BetterAuthSecret` cannot be adopted the same way: it is `Alchemy.Random`,
 * generated client-side and stored only in `.alchemy/`. A cache miss (a
 * 411-byte restore is not real stack state) remints it. D1 `jwks` rows
 * encrypt their private keys with that secret, so a new secret cannot sign
 * until `ramoseToken` mints a replacement key. Old session *cookies* die
 * (HMAC); password sign-in of an existing user still works. Do not delete
 * AuthDb to "fix" a login bounce.
 */

/** The demo's hostname, e.g. `reef.ramose.ai`. Unset outside the prod publish. */
export const REEF_DOMAIN = process.env.REEF_DOMAIN || undefined;

/** The demo's public origin, or `undefined` when no domain is configured. */
export const REEF_ORIGIN = REEF_DOMAIN ? `https://${REEF_DOMAIN}` : undefined;

/**
 * The zone a hostname belongs to — the registrable domain, i.e. the last two
 * labels (`reef.ramose.ai` → `ramose.ai`). Enough for this demo; a hostname
 * on a multi-label public suffix would need the real PSL.
 */
export const zoneOf = (host: string): string => host.split(".").slice(-2).join(".");

/**
 * Physical names, pinned only when a domain is configured. Spread into props:
 * `...pinned("api")` is `{}` on a personal stage and `{ name: ... }` on prod.
 */
export const pinned = (suffix: string): { name?: string } =>
  REEF_DOMAIN ? { name: `ramose-reef-${suffix}` } : {};
