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
import { isDatabaseError, NetworkError } from "./Errors.js";
// ── base64url, by hand ──────────────────────────────────────────────────────
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/**
 * base64url → bytes, hand-rolled: no `atob` (Workers and browsers disagree on
 * padding and unicode), no `Buffer` (browsers have none).
 */
const base64UrlBytes = (input) => {
    const cleaned = input.replace(/=+$/, "");
    const out = new Uint8Array(Math.floor((cleaned.length * 6) / 8));
    let buffer = 0;
    let bits = 0;
    let at = 0;
    for (const char of cleaned) {
        const six = B64URL.indexOf(char);
        if (six < 0)
            throw new Error("ramose: invalid base64url");
        buffer = (buffer << 6) | six;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[at++] = (buffer >> bits) & 0xff;
        }
    }
    return out;
};
/** The payload of a compact JWT, or `{}` for anything that is not one. */
const decodeClaims = (value) => {
    const parts = value.split(".");
    if (parts.length !== 3)
        return {};
    try {
        const payload = JSON.parse(new TextDecoder().decode(base64UrlBytes(parts[1])));
        return typeof payload === "object" &&
            payload !== null &&
            !Array.isArray(payload)
            ? payload
            : {};
    }
    catch {
        return {};
    }
};
// ── the sources ─────────────────────────────────────────────────────────────
/** `DbError` passes through (a thrown `Unauthorized` stays terminal); the rest is transport. */
export const wrapTokenCause = (cause) => isDatabaseError(cause)
    ? cause
    : new NetworkError({
        message: `ramose: token mint failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
    });
const unwrap = (minted) => typeof minted === "string" ? minted : minted.token;
const jwt = (mint, options) => {
    const marginMs = options?.refreshMarginMs ?? 2 * 60 * 1000;
    let cached;
    let inflight;
    // bumped by invalidate(), so a mint already in flight cannot resurrect the
    // old tenant's token into the cache
    let epoch = 0;
    const refreshAt = (claims, mintedAtMs) => {
        const exp = claims.exp;
        if (typeof exp !== "number" || !Number.isFinite(exp))
            return undefined;
        const expMs = exp * 1000;
        const lifetimeMs = expMs - mintedAtMs;
        // a lifetime shorter than the margin would otherwise re-mint on every
        // read; half-life keeps the cache useful
        return lifetimeMs <= marginMs
            ? mintedAtMs + Math.max(lifetimeMs, 0) / 2
            : expMs - marginMs;
    };
    /** One mint at a time: concurrent readers share the in-flight promise. */
    const mintNow = () => {
        if (inflight !== undefined)
            return inflight;
        const at = epoch;
        const attempt = Promise.resolve()
            .then(() => mint())
            .then((minted) => {
            const value = unwrap(minted);
            const claims = decodeClaims(value);
            const entry = {
                value,
                claims,
                refreshAtMs: refreshAt(claims, Date.now()),
            };
            if (epoch === at)
                cached = entry;
            return entry;
        }, (cause) => {
            throw wrapTokenCause(cause);
        })
            .finally(() => {
            if (inflight === attempt)
                inflight = undefined;
        });
        inflight = attempt;
        return attempt;
    };
    const current = () => {
        const entry = cached;
        if (entry !== undefined &&
            (entry.refreshAtMs === undefined || Date.now() < entry.refreshAtMs)) {
            return Promise.resolve(entry.value);
        }
        return mintNow().then((minted) => minted.value);
    };
    return {
        token: current,
        claims: () => cached !== undefined
            ? Promise.resolve(cached.claims)
            : mintNow().then((minted) => minted.claims),
        peek: () => cached?.claims,
        invalidate: () => {
            epoch += 1;
            cached = undefined;
            inflight = undefined;
        },
    };
};
/** A fixed credential, as a {@link TokenSource}. */
const staticSource = (value) => ({
    token: () => Promise.resolve(value),
    claims: () => Promise.resolve(decodeClaims(value)),
    peek: () => decodeClaims(value),
    invalidate: () => { },
});
/**
 * Synchronous claims from a {@link TokenInput}: a string is decoded now, a
 * {@link TokenSource} answers from its cache, a mint function is `undefined`
 * until something has called `token()` / `claims()`.
 */
export const peekClaims = (token) => {
    if (token === undefined)
        return undefined;
    if (typeof token === "string")
        return decodeClaims(token);
    if (isTokenSource(token) && typeof token.peek === "function") {
        return token.peek();
    }
    return undefined;
};
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
export const token = { jwt, static: staticSource };
/** Whether `value` is a {@link TokenSource} (has a `token()` reader). */
export const isTokenSource = (value) => typeof value === "object" &&
    value !== null &&
    typeof value.token === "function" &&
    typeof value.claims === "function";
//# sourceMappingURL=token.js.map