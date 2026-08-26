/**
 * `ramose/better-auth` — the Better Auth server plugin that mints the
 * workspace-scoped JWTs a Ramose peer verifies
 * (https://ramose.ai/guides/sign-in/).
 *
 * Ramose verifies tokens and never issues them, so every app repeats the
 * same mint route: read the Better Auth session, decide the caller's policy
 * class for the requested database, build the payload with `Ramose.claims`,
 * sign it with `signJWT`. {@link ramoseToken} is that route as a plugin —
 * the app keeps exactly one decision, {@link ClassOf}.
 *
 * It requires Better Auth's `jwt` plugin and signs with the same JWKS key,
 * so the peer's `RAMOSE_JWKS_URL` (the jwt plugin's `/jwks` endpoint) reads
 * the matching public half with no extra key management.
 *
 * ```typescript
 * betterAuth({
 *   plugins: [
 *     organization(),
 *     jwt({ jwt: { issuer: AUTH.issuer, audience: AUTH.audience,
 *                  expirationTime: `${AUTH.ttl}s` } }),
 *     ramoseToken({ auth: AUTH, policy: compiledPolicy, classOf: orgClassOf() }),
 *   ],
 * });
 * ```
 *
 * The route is `POST {basePath}/ramose/token { db } → { token, class, exp }`
 * — the shape `Ramose.token.jwt` accepts unchanged. The paired browser
 * plugin lives on `ramose/better-auth/client`.
 *
 * This entry needs the optional peers `better-auth` and `zod`.
 */
import { type AuthConfig } from "../Auth.ts";
import type { CompiledPolicy } from "../internal/core/policy/ast.ts";
import { type GenericEndpointContext, type Session, type User } from "better-auth";
import { type JwtOptions } from "better-auth/plugins/jwt";
import * as z from "zod";
/** The Better Auth session, as {@link ClassOf} sees it. */
export interface SessionInfo {
    readonly session: Session & Record<string, unknown>;
    readonly user: User & Record<string, unknown>;
}
/** What {@link ClassOf} decides: a class, optionally with `ramose.attrs`. */
export interface ClassGrant {
    /** The policy class the token selects (`ramose.class`). */
    readonly class: string;
    /** App claims (`ramose.attrs`), decoded by the policy's `claims` struct. */
    readonly attrs?: Readonly<Record<string, unknown>>;
}
/** What {@link ClassOf} receives: the caller, the database, the endpoint. */
export interface ClassOfInput {
    /** The authenticated Better Auth session (the mint route requires one). */
    readonly session: SessionInfo;
    /** The database the caller asked a token for (already a valid name). */
    readonly db: string;
    /**
     * The Better Auth endpoint context — `ctx.context.adapter` for lookups,
     * `ctx.headers` / `ctx.request` for anything request-scoped.
     */
    readonly ctx: GenericEndpointContext;
}
/**
 * The one decision the app owns: the caller's policy class for `db`, or
 * `null` for no access (a 403 that leaks nothing — "no org with that slug"
 * and "not a member of it" are the same answer). Return a {@link ClassGrant}
 * to also carry `ramose.attrs`.
 */
export type ClassOf = (input: ClassOfInput) => string | ClassGrant | null | Promise<string | ClassGrant | null>;
export interface RamoseTokenOptions {
    /**
     * The verifier/minter contract — the same `AuthConfig` the peer's
     * `Server({ auth: { jwt } })` pins, so a minted lifetime can never exceed
     * the verifier's cap.
     */
    readonly auth: AuthConfig;
    /** Resolves the caller's class for the requested database; see {@link ClassOf}. */
    readonly classOf: ClassOf;
    /**
     * The policy value, its compiled JSON, or the parsed AST.
     * Optional; when given, a class the policy does not declare fails the mint
     * instead of minting a token that grants nothing. Passing the policy
     * value also narrows `Ramose.claims`' `class`.
     */
    readonly policy?: CompiledPolicy | string | {
        readonly classes: readonly string[];
    };
    /**
     * Where the route lives under Better Auth's `basePath`.
     * @default "/ramose/token" — which Better Auth's client proxy exposes as
     * `authClient.ramose.token`.
     */
    readonly path?: string;
}
/**
 * Mint a new JWKS row when the latest private key cannot be decrypted with
 * the current Better Auth secret. No-op when encryption is off, when no key
 * exists yet (`signJWT` / `/jwks` create the first one), or when decrypt
 * succeeds.
 */
export declare const ensureDecryptableJwks: (ctx: GenericEndpointContext, options: JwtOptions | undefined) => Promise<void>;
/**
 * The mint-route server plugin. `POST {path} { db }` with a session cookie
 * answers `{ token, class, exp }`; `classOf` returning `null` is a 403 and a
 * missing session a 401. Requires the `jwt` plugin (checked at init) and
 * signs with its JWKS via the same server-only path as `auth.api.signJWT`.
 *
 * JWKS private keys are encrypted with Better Auth's signing secret. If that
 * secret is reminted (Alchemy `Random` lives only in stack state; a cache
 * miss creates a new `BetterAuthSecret`) the existing `jwks` rows stay in
 * D1 but can no longer be decrypted. The jwt plugin's default `/get-session`
 * after-hook then throws while attaching `set-auth-jwt`, which is the
 * "signed in, bounced to create-account" hole: sign-in writes a session,
 * `useSession` refetches, the 500 looks like no user. {@link
 * ensureDecryptableJwks} mints a new key when decrypt fails so a rotated
 * secret does not brick login or mint. Existing public keys stay in `/jwks`
 * so in-flight tokens still verify until they expire.
 */
export declare const ramoseToken: (options: RamoseTokenOptions) => {
    id: "ramose-token";
    init: (ctx: import("better-auth").AuthContext) => void;
    hooks: {
        before: {
            matcher: (ctx: import("better-auth").HookEndpointContext) => boolean;
            handler: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<void>>;
        }[];
    };
    endpoints: {
        ramoseToken: import("better-auth").StrictEndpoint<string, {
            method: "POST";
            body: z.ZodObject<{
                db: z.ZodString;
            }, z.core.$strip>;
            use: import("better-auth").Middleware<import("better-auth").MiddlewareOptions, (inputContext: import("better-auth").MiddlewareInputContext<import("better-auth").MiddlewareOptions>) => Promise<{
                session: {
                    session: Record<string, any> & {
                        id: string;
                        createdAt: Date;
                        updatedAt: Date;
                        userId: string;
                        expiresAt: Date;
                        token: string;
                        ipAddress?: string | null | undefined;
                        userAgent?: string | null | undefined;
                    };
                    user: Record<string, any> & {
                        id: string;
                        createdAt: Date;
                        updatedAt: Date;
                        email: string;
                        emailVerified: boolean;
                        name: string;
                        image?: string | null | undefined;
                    };
                };
            }>>[];
            metadata: {
                openapi: {
                    operationId: string;
                    description: string;
                    responses: {
                        "200": {
                            description: string;
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object";
                                        properties: {
                                            token: {
                                                type: string;
                                            };
                                            class: {
                                                type: string;
                                            };
                                            exp: {
                                                type: string;
                                            };
                                        };
                                        required: string[];
                                    };
                                };
                            };
                        };
                    };
                };
            };
        }, {
            token: string;
            class: string;
            exp: number | undefined;
        }>;
    };
};
/**
 * The org-role → policy-class mapping Reef established: `owner` and `admin`
 * are `owner`, `member` is `member`, anything else (or absent) is `viewer`.
 * Better Auth roles can be comma-separated; the first one decides.
 * `owner` is a schema class, not a bypass class.
 */
export declare const classOfRole: (role: string) => "owner" | "member" | "viewer";
export interface OrgClassOfOptions {
    /**
     * Role → class. Return `null` to deny a role outright.
     * @default {@link classOfRole}
     */
    readonly map?: (role: string) => string | null;
}
/**
 * A {@link ClassOf} for the `organization` plugin's tables, for apps where
 * an organization's slug *is* the Ramose database name: the caller's member
 * row in the org whose slug is `db` decides the class ({@link classOfRole}
 * by default); no such org or no membership is `null` → 403. Name and email
 * from the Better Auth user ride under `ramose.attrs` so the peer can stamp
 * them on the principal row — the app never writes that row.
 */
export declare const orgClassOf: (options?: OrgClassOfOptions) => ClassOf;
//# sourceMappingURL=index.d.ts.map