/**
 * `token` — shipped token sources for `Ramose.connect({ token })`.
 *
 * The client re-reads its token on every (re)connect and every write, so
 * refresh needs no client API: a source only has to *return the current
 * token* each time it is read. `token.jwt(mint)` is that source for the
 * common case — fetch a JWT from your auth endpoint, cache it, and re-mint
 * once the cached token is inside a margin of its `exp`. Refresh is
 * entirely client-side; the peer sees nothing but bearer tokens.
 *
 * Failure typing: `mint` is a plain promise, so callers throw what they like.
 * A thrown `DbError` passes through untouched (throw `new Unauthorized(…)` to
 * make a standing `live` fail terminally); anything else wraps in
 * `NetworkError`, which the transports treat as transient and retry.
 */
import { type DbError } from "./Errors.ts";
/**
 * A JWT payload, decoded (base64url) but **not verified** — UI hints only.
 * Trust nothing here for authorization; the peer verifies signatures.
 */
export interface Claims {
    readonly sub?: string;
    readonly iss?: string;
    readonly aud?: string | readonly string[];
    readonly exp?: number;
    readonly iat?: number;
    readonly ramose?: {
        readonly db?: string;
        readonly class?: string;
        readonly attrs?: Record<string, unknown>;
    };
    readonly [claim: string]: unknown;
}
/** A credential `Ramose.connect({ token })` accepts besides a bare string. */
export interface TokenSource {
    /** Current bearer token — re-read on every (re)connect and every write. */
    readonly token: () => Promise<string>;
    /**
     * The current payload, decoded, NOT verified — UI hints only
     * (`ramose.class`, `sub`, `exp`). Mints if nothing is cached; otherwise it
     * answers from the cache as-is, even when the cached token is due for a
     * refresh — this is a peek, never a refresh.
     */
    readonly claims: () => Promise<Claims>;
    /**
     * Cached payload, or `undefined` if nothing has been minted yet.
     * Synchronous — UI hints only, never a mint or refresh.
     */
    readonly peek: () => Claims | undefined;
    /** Drop the cache: sign-out, tenant switch. The next read mints. */
    readonly invalidate: () => void;
}
/** What `connect` / the provider accept as a bearer credential. */
export type TokenInput = string | TokenSource | (() => string | Promise<string>);
/** `DbError` passes through (a thrown `Unauthorized` stays terminal); the rest is transport. */
export declare const wrapTokenCause: (cause: unknown) => DbError;
/**
 * What `mint` resolves to: the JWT itself, or any object carrying it under
 * `token` — so a mint route's `r.json()` (`{ token, class, exp }`) passes
 * straight through without unwrapping.
 */
export type Minted = string | {
    readonly token: string;
};
/**
 * Synchronous claims from a {@link TokenInput}: a string is decoded now, a
 * {@link TokenSource} answers from its cache, a mint function is `undefined`
 * until something has called `token()` / `claims()`.
 */
export declare const peekClaims: (token: TokenInput | undefined) => Claims | undefined;
/**
 * The shipped token sources.
 *
 * ```typescript
 * const source = Ramose.token.jwt(() =>
 *   fetch("/api/ramose-token", { method: "POST" }).then((r) => r.json()),
 * );
 * const ramose = Ramose.connect({ url, token: source });
 * ```
 */
export declare const token: {
    /**
     * A refreshing JWT source. `mint` is called lazily on the first read,
     * single-flight, and again once the cached token is within
     * `refreshMarginMs` (default 2 minutes) of its `exp`. A payload with no
     * `exp` is static: minted once, refreshed only by `invalidate()`. `mint`
     * may resolve to the JWT or to `{ token }` — a mint route's JSON body
     * passes through.
     */
    readonly jwt: (mint: () => Promise<Minted>, options?: {
        readonly refreshMarginMs?: number;
    }) => TokenSource;
    /** Sugar for a fixed credential. */
    readonly static: (value: string) => TokenSource;
};
/** Whether `value` is a {@link TokenSource} (has a `token()` reader). */
export declare const isTokenSource: (value: unknown) => value is TokenSource;
//# sourceMappingURL=token.d.ts.map