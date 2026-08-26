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
// Auth.ts is alchemy-free. The deploy barrel (`../index.ts`) value-exports
// Server, which pulls `alchemy/*` into every auth Worker that adds this plugin.
import { claims } from "../Auth.js";
import { isDatabaseName } from "../db/index.js";
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
                body: z.object({
                    db: z.string().meta({
                        description: "The Ramose database this token is to be bound to",
                    }),
                }),
                use: [sessionMiddleware],
                metadata: {
                    openapi: {
                        operationId: "mintRamoseToken",
                        description: "Mint a Ramose JWT bound to one database, signed with the jwt plugin's JWKS",
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
                const db = ctx.body.db;
                // The peer would 400 this anyway; failing at mint keeps the error
                // near its cause. `claims` re-checks, but after `classOf` ran.
                if (!isDatabaseName(db)) {
                    throw new APIError("BAD_REQUEST", {
                        message: `ramose: ${JSON.stringify(db)} is not a valid database name`,
                    });
                }
                const granted = await options.classOf({ session, db, ctx });
                const grant = typeof granted === "string" ? { class: granted } : granted;
                if (grant === null) {
                    // One answer for "no such database" and "not a member of it".
                    throw new APIError("FORBIDDEN", {
                        message: "ramose: no access to this database",
                    });
                }
                let payload;
                try {
                    payload = claims(options.auth, {
                        sub: session.user.id,
                        db,
                        class: grant.class,
                        attrs: grant.attrs,
                    }, options.policy);
                }
                catch (cause) {
                    // `db` was validated above, so what `claims` rejects here is
                    // deploy configuration: a class the policy does not declare, or
                    // a bad ttl. The caller cannot fix either.
                    throw new APIError("INTERNAL_SERVER_ERROR", {
                        message: cause instanceof Error ? cause.message : String(cause),
                    });
                }
                // Sign with the jwt plugin's own options so the key (JWKS row,
                // alg, encryption) is exactly the one /jwks publishes. Heal first
                // so a reminted Better Auth secret does not 500 the mint (the
                // before-hook covers HTTP; `auth.api.ramoseToken` hits this too).
                const jwtOptions = jwtOptionsOf(ctx);
                await ensureDecryptableJwks(ctx, jwtOptions);
                // Spread: `signJWT` wants jose's index-signed `JWTPayload`, which
                // a named interface is not assignable to.
                const token = await signJWT(ctx, {
                    options: jwtOptions,
                    payload: { ...payload },
                });
                return ctx.json({ token, class: grant.class, exp: payload.exp });
            }),
        },
    };
};
// ── the organization-plugin default, opt-in ────────────────────────────────
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
/** Display fields the peer stamps onto the principal row from `ramose.attrs`. */
const profileAttrs = (user) => {
    const attrs = {};
    if (typeof user.name === "string")
        attrs.name = user.name;
    if (typeof user.email === "string")
        attrs.email = user.email;
    return Object.keys(attrs).length === 0 ? undefined : attrs;
};
/**
 * A {@link ClassOf} for the `organization` plugin's tables, for apps where
 * an organization's slug *is* the Ramose database name: the caller's member
 * row in the org whose slug is `db` decides the class ({@link classOfRole}
 * by default); no such org or no membership is `null` → 403. Name and email
 * from the Better Auth user ride under `ramose.attrs` so the peer can stamp
 * them on the principal row — the app never writes that row.
 */
export const orgClassOf = (options) => {
    const map = options?.map ?? classOfRole;
    return async ({ session, db, ctx }) => {
        const org = await ctx.context.adapter.findOne({
            model: "organization",
            where: [{ field: "slug", value: db }],
        });
        if (org === null)
            return null;
        const member = await ctx.context.adapter.findOne({
            model: "member",
            where: [
                { field: "organizationId", value: org.id },
                { field: "userId", value: session.user.id },
            ],
        });
        if (member === null)
            return null;
        const cls = map(member.role);
        if (cls === null)
            return null;
        return { class: cls, attrs: profileAttrs(session.user) };
    };
};
//# sourceMappingURL=index.js.map