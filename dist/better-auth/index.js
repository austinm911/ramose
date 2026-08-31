import { claims } from "../Auth.js";
import { BetterAuthError, } from "better-auth";
import { APIError, createAuthEndpoint, createAuthMiddleware, sessionMiddleware } from "better-auth/api";
import { symmetricDecrypt } from "better-auth/crypto";
import { createJwk, signJWT } from "better-auth/plugins/jwt";
import * as z from "zod";
const jwtOptionsOf = (ctx) => {
    const jwtPlugin = ctx.context.options.plugins?.find((plugin) => plugin.id === "jwt");
    return jwtPlugin?.options;
};
const asDate = (value) => {
    if (value == null)
        return undefined;
    return value instanceof Date ? value : new Date(value);
};
/**
 * Mint a new JWKS row when the latest private key cannot be decrypted with
 * the current Better Auth secret. No-op when encryption is off, when no key
 * exists yet (`signJWT` / `/jwks` create the first one), or when decrypt
 * succeeds.
 */
export const ensureDecryptableJwks = async (ctx, options) => {
    if (options?.jwks?.disablePrivateKeyEncryption)
        return;
    const rows = (await ctx.context.adapter.findMany({ model: "jwks" })) ?? [];
    const latest = rows
        .slice()
        .sort((a, b) => (asDate(b.createdAt)?.getTime() ?? 0) -
        (asDate(a.createdAt)?.getTime() ?? 0))[0];
    if (latest === undefined)
        return;
    const expiresAt = asDate(latest.expiresAt);
    if (expiresAt !== undefined && expiresAt < new Date()) {
        await createJwk(ctx, options);
        return;
    }
    try {
        await symmetricDecrypt({
            key: ctx.context.secretConfig,
            data: JSON.parse(latest.privateKey),
        });
    }
    catch {
        await createJwk(ctx, options);
    }
};
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
export const ramoseToken = (options) => {
    const mintPath = options.path ?? "/ramose/token";
    return {
        id: "ramose-token",
        init: (ctx) => {
            if (!(ctx.options.plugins ?? []).some((plugin) => plugin.id === "jwt")) {
                throw new BetterAuthError("ramose: the ramoseToken plugin requires Better Auth's jwt plugin — " +
                    "it signs with the same JWKS the server's RAMOSE_JWKS_URL reads. " +
                    "Add jwt() to the plugins array.");
            }
        },
        hooks: {
            before: [
                {
                    matcher: (ctx) => ctx.path === "/get-session" ||
                        ctx.path === "/token" ||
                        ctx.path === mintPath,
                    handler: createAuthMiddleware(async (ctx) => {
                        await ensureDecryptableJwks(ctx, jwtOptionsOf(ctx));
                    }),
                },
            ],
        },
        endpoints: {
            ramoseToken: createAuthEndpoint(mintPath, {
                method: "POST",
                body: z.object({}).optional(),
                use: [sessionMiddleware],
                metadata: {
                    openapi: {
                        operationId: "mintRamoseToken",
                        description: "Mint a Ramose identity JWT, signed with the jwt plugin's JWKS",
                        responses: {
                            "200": {
                                description: "The minted token",
                                content: {
                                    "application/json": {
                                        schema: {
                                            type: "object",
                                            properties: {
                                                token: { type: "string" },
                                                class: { type: "string" },
                                                exp: { type: "number" },
                                            },
                                            required: ["token", "class", "exp"],
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }, async (ctx) => {
                const session = ctx.context.session;
                const granted = await options.classOf({ session, ctx });
                const grant = typeof granted === "string" ? { class: granted } : granted;
                if (grant === null) {
                    throw new APIError("FORBIDDEN", {
                        message: "ramose: no access",
                    });
                }
                let payload;
                try {
                    payload = claims(options.auth, {
                        sub: session.user.id,
                        class: grant.class,
                        attrs: grant.attrs,
                    }, options.policy);
                }
                catch (cause) {
                    throw new APIError("INTERNAL_SERVER_ERROR", {
                        message: cause instanceof Error ? cause.message : String(cause),
                    });
                }
                const jwtOptions = jwtOptionsOf(ctx);
                await ensureDecryptableJwks(ctx, jwtOptions);
                const token = await signJWT(ctx, {
                    options: jwtOptions,
                    payload: { ...payload },
                });
                return ctx.json({ token, class: grant.class, exp: payload.exp });
            }),
        },
    };
};
/**
 * The org-role → policy-class mapping Reef established: `owner` and `admin`
 * are `owner`, `member` is `member`, anything else (or absent) is `viewer`.
 * Better Auth roles can be comma-separated; the first one decides.
 * `owner` is a schema class, not a bypass class.
 */
export const classOfRole = (role) => {
    const primary = role.split(",")[0]?.trim() ?? role;
    switch (primary) {
        case "owner":
        case "admin":
            return "owner";
        case "member":
            return "member";
        default:
            return "viewer";
    }
};
//# sourceMappingURL=index.js.map