/**
 * The peer's handshake, selected by `RAMOSE_POLICY`:
 *
 *   unset  legacy — open, or a shared `RAMOSE_TOKEN` if one is set; class `admin`
 *   set    JWT only; `RAMOSE_TOKEN` is not a data-plane principal on `/db/:name`
 *
 * A configured policy makes verification mandatory: a missing JWKS / issuer /
 * audience denies every `/db/*` and logs once, never falls open. A bound
 * verifier (`RAMOSE_JWKS_*` / `RAMOSE_JWT_ISS` / `RAMOSE_JWT_AUD`) with no
 * policy is the same fail-closed: that is not an open server. Binding
 * nothing stays open. Keys come from `RAMOSE_JWKS_URL`, or `RAMOSE_JWKS_JSON`
 * for offline runs; when the issuer is a sibling Worker, `RAMOSE_JWKS_SERVICE`
 * names the service binding the fetch is dispatched through (see
 * {@link jwksFetch}).
 */
import { type CompiledPolicy, type Db, type NodeSource, type Principal, isSchemaTx, shouldProvision } from "../internal/core/index.ts";
import { type Basis } from "../internal/replica/basis.ts";
import { type RamoseEnv } from "../internal/transactor/index.ts";
import { type JWTVerifyGetKey } from "jose";
import { DEFAULT_JWT_MAX_TTL } from "../Auth.ts";
import type { WritesMode } from "../writes.ts";
export { DEFAULT_JWT_MAX_TTL };
/** Per-isolate memo lifetime for a verified principal. */
export declare const PRINCIPAL_MEMO_MS = 60000;
/** The class a policy must declare for tokenless callers to get in. */
export declare const ANONYMOUS_CLASS = "anonymous";
/**
 * The `RAMOSE_TOKEN` holder under a policy. Undeclarable as a policy class, so
 * every rule denies it; the routes let it reach `ensure`'s no-op case only.
 */
export declare const TOKEN_ONLY_CLASS = "$token";
export interface AuthState {
    /** `RAMOSE_POLICY` is set */
    readonly configured: boolean;
    readonly policy?: CompiledPolicy;
    /** set = deny every `/db/*` (malformed policy, or an incomplete verifier) */
    readonly broken?: string;
    readonly issuers?: readonly string[];
    readonly aud?: string;
    readonly maxTtl: number;
    readonly keys?: JWTVerifyGetKey;
}
type AuthEnv = Pick<RamoseEnv, "RAMOSE_POLICY" | "RAMOSE_TOKEN" | "RAMOSE_JWKS_URL" | "RAMOSE_JWKS_JSON" | "RAMOSE_JWKS_SERVICE" | "RAMOSE_JWT_ISS" | "RAMOSE_JWT_AUD" | "RAMOSE_JWT_MAX_TTL" | "RAMOSE_ALLOWED_ORIGINS">;
/** The peer's auth configuration, resolved once per isolate. */
export declare function authState(env: AuthEnv): AuthState;
/** Test hook: forget the resolved config and every memoized principal. */
export declare function clearAuthCache(): void;
/** The `RAMOSE_TOKEN` holder under a policy: no class, no data plane. */
export declare const isTokenOnly: (p: Principal) => boolean;
/** Past `exp`? Checked on every use of a memoized principal and on every session frame. */
export declare function isExpired(p: Principal, now?: number): boolean;
/** `Authorization: Bearer …`, else `?token=` (a browser cannot set headers on an upgrade). */
export declare function bearerOf(request: Request): string | undefined;
/** The verified caller for `dbName`. Throws `Unauthorized`; never falls open. */
export declare function principalOf(env: RamoseEnv, request: Request, dbName: string): Promise<Principal>;
/** Same, for a token off the wire (the session's `auth` frame). */
export declare function principalForToken(env: RamoseEnv, token: string | undefined, dbName: string): Promise<Principal>;
/** Drop a cached `sub → eid` (and any provision memo for that pair) after a write. */
export declare function forgetEid(sub: string, dbName: string): void;
/** Remember a just-provisioned eid so `/info` and `withEid` see it immediately. */
export declare function rememberProvisioned(principal: Principal, eid: number): Principal;
/** A still-fresh provision memo for this token class + attrs, if we already wrote the row. */
export declare function cachedProvision(principal: Principal): number | undefined;
export { shouldProvision };
/** Resolve the principal entity with one AVET lookup on the policy's `principal` attribute. */
export declare function withEid(policy: CompiledPolicy, principal: Principal, ruleDb: Db): Promise<Principal>;
/**
 * The principal as the wire tells it to its own client — the session `auth`
 * ack and `/info` carry `{ eid, class }`. `eid: null` only for principals
 * the peer does not provision (anonymous, service, no policy, or the
 * principal attr is not deployed yet). Informational, so unlike {@link withEid}
 * it resolves for superusers too: a superuser is exempt from filtering, not
 * from having a row.
 */
export declare function describePrincipal(env: RamoseEnv, principal: Principal, store: NodeSource, basis: Basis): Promise<{
    eid: number | null;
    class: string;
}>;
/**
 * The `Db` a read runs against: the data view at the requested `t`, filtered by
 * the rules read from the *current* basis (so history cannot re-grant).
 */
export declare function viewDb(env: RamoseEnv, principal: Principal, store: NodeSource, basis: Basis, opts?: {
    asOf?: number;
    history?: boolean;
}): Promise<Db>;
export { isSchemaTx };
/**
 * Raw `/transact` (HTTP or a session `{ op: "transact" }` frame).
 * `"all"` is open. Superuser and `$token` keep it under `"operations"`.
 * Schema-only txs are exempt — `checkWrite` already polices them
 * (unknown ident stays 403 schema-class; already-deployed subset is a skip).
 *
 * No compiled policy is open mode: service ingress is unrestricted. The
 * display class `"admin"` is a label, not a bypass key — an app-class
 * caller still needs the operations restriction.
 */
export declare function allowsRawTransact(writes: WritesMode, principal: Principal | undefined, tx: unknown, policy?: CompiledPolicy): boolean;
/**
 * `send` carries the ops to forward and the principal with its entity
 * resolved; `skip` is a no-op `ensure`.
 */
export type WriteCheck = {
    readonly kind: "send";
    readonly tx: unknown[];
    readonly principal: Principal;
} | {
    readonly kind: "skip";
};
/**
 * The ingress pre-check, against the replica's basis. Best effort —
 * the replica lags the writer, so this is a latency optimisation and the
 * transactor's own check is the authority.
 */
export declare function checkWrite(env: RamoseEnv, principal: Principal, store: NodeSource, basis: Basis, tx: unknown[]): Promise<WriteCheck>;
/**
 * `access-control-allow-origin` under a policy: `undefined` leaves today's `*`,
 * `null` means send no header at all.
 */
export declare function allowedOrigin(env: RamoseEnv, request: Request): string | null | undefined;
//# sourceMappingURL=auth.d.ts.map