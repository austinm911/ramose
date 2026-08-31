import { type AuthConfig } from "../Auth.ts";
import type { ClaimsPolicy } from "../Auth.ts";
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
    readonly class: string;
    readonly attrs?: Readonly<Record<string, unknown>> | undefined;
}
/** What {@link ClassOf} receives: the caller and the endpoint. */
export interface ClassOfInput {
    readonly session: SessionInfo;
    readonly ctx: GenericEndpointContext;
}
/**
 * The one decision the app owns: the caller's deployment-global policy
 * class, or `null` for no access (a 403). Return a {@link ClassGrant} to
 * also carry `ramose.attrs`. Classes and attributes must be genuinely
 * global — not derived from a requested route, database, or org slug.
 * Database-local roles stay out of the JWT.
 */
export type ClassOf = (input: ClassOfInput) => string | ClassGrant | null | Promise<string | ClassGrant | null>;
export interface RamoseTokenOptions {
    readonly auth: AuthConfig;
    readonly classOf: ClassOf;
    readonly policy?: ClaimsPolicy;
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
 * The mint-route server plugin. `POST {path}` with a session cookie answers
 * `{ token, class, exp }`; `classOf` returning `null` is a 403 and a
 * missing session a 401. Requires the `jwt` plugin (checked at init) and
 * signs with its JWKS via the same server-only path as `auth.api.signJWT`.
 * The request body is not a database selector — leftover `{ db }` is ignored.
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
            body: z.ZodOptional<z.ZodObject<{}, z.core.$strip>>;
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
//# sourceMappingURL=index.d.ts.map