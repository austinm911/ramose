/**
 * Constants shared by the auth Worker (api.ts), the peer wiring
 * (resources.ts) and the SPA. Import-light on purpose: this module ends up in
 * the auth Worker bundle.
 */

/**
 * The `iss` every Reef JWT carries and the peer pins (`RIPPLE_JWT_ISS`). An
 * opaque agreed string — verification keys come from the JWKS URL, not from
 * resolving this.
 */
export const JWT_ISSUER = "reef-demo-auth";

/** The `aud` every Reef JWT carries and the peer pins (`RIPPLE_JWT_AUD`). */
export const JWT_AUDIENCE = "ripple:reef";

/**
 * Token lifetime. Better Auth signs `exp - iat` of exactly this many seconds
 * and the peer caps accepted lifetimes at the same value
 * (`RIPPLE_JWT_MAX_TTL`); the SPA re-mints slightly earlier.
 */
export const JWT_TTL_SECONDS = 900;

/** Where the SPA's Better Auth routes live on the auth Worker. */
export const AUTH_BASE_PATH = "/api/auth";

/** Pinned local-dev ports (`dev.port` on each Worker declaration). */
export const DEV_PEER_PORT = 1337;
export const DEV_API_PORT = 1338;
export const DEV_UI_ORIGIN = "http://localhost:5173";

export const CLASSES = ["admin", "member", "viewer"] as const;
export type RippleClass = (typeof CLASSES)[number];

/**
 * Better Auth org role → the `ripple.class` claim its JWT carries. Roles can
 * be comma-separated in Better Auth; the first one decides.
 */
export const classOfRole = (role: string): RippleClass => {
  const primary = role.split(",")[0]?.trim() ?? role;
  switch (primary) {
    case "owner":
    case "admin":
      return "admin";
    case "member":
      return "member";
    default:
      return "viewer";
  }
};

/**
 * Workspace slug = Ripple database name, so it must satisfy the peer's
 * `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`. The UI keeps it to the friendly subset.
 */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
