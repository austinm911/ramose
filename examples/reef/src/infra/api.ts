/**
 * The Reef auth Worker — Better Auth on Cloudflare D1 via
 * `@alchemy.run/better-auth`, plus the one custom route that bridges it to
 * Ripple: `POST /api/ripple-token`.
 *
 * What it serves:
 *
 *   /api/auth/*         Better Auth: email+password sign-in, the organization
 *                       plugin (a Reef workspace *is* an org; its slug is the
 *                       Ripple database name), and the jwt plugin (JWKS at
 *                       /api/auth/jwks — the peer's `RIPPLE_JWKS_URL`).
 *   /api/ripple-token   Mints the workspace-scoped JWT the Ripple peer
 *                       verifies: `sub` is the Better Auth user id and
 *                       `ripple: { db, class }` comes from the caller's org
 *                       membership (role → class). Signed with the same
 *                       managed JWKS key via the server-only `signJWT`.
 *   /*                  The built SPA (examples/reef/dist), assets-first with
 *                       single-page-app fallback. `bunx vite build` fills it;
 *                       during local dev the Vite dev server is used instead.
 *
 * This Worker never talks to the Ripple peer — the browser is the only data
 * plane client. That keeps the resource graph acyclic: the peer's env needs
 * this Worker's URL (JWKS), and this Worker needs nothing back.
 *
 * Module layout note: `main: import.meta.url` makes this the Worker bundle
 * entry, so `Alchemy.Stack` must live elsewhere (../../alchemy.run.ts).
 */

import { BetterAuth } from "@alchemy.run/better-auth";
import { CloudflareD1 } from "@alchemy.run/better-auth/CloudflareD1";
import * as Cloudflare from "alchemy/Cloudflare";
import { jwt } from "better-auth/plugins/jwt";
import { organization } from "better-auth/plugins/organization";
import * as Effect from "effect/Effect";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { ac, roles } from "../domain/roles.ts";
import {
  AUTH_BASE_PATH,
  DEV_API_PORT,
  DEV_UI_ORIGIN,
  JWT_AUDIENCE,
  JWT_ISSUER,
  JWT_TTL_SECONDS,
  SLUG_RE,
  classOfRole,
} from "../domain/shared.ts";

/** Better Auth's tables (user/session/org/member/invitation/jwks) live here. */
export const AuthDb = Cloudflare.D1.Database("AuthDb");

const json = (body: unknown, status = 200) =>
  HttpServerResponse.json(body, { status });

export const Api = Cloudflare.Worker(
  "Api",
  {
    main: import.meta.url,
    // Date must be >= 2026-02-19: below it, @cloudflare/unenv-preset swaps
    // the native workerd `process` for a hybrid whose `stdin` is not an
    // EventEmitter, and the Effect Worker runtime's Terminal layer (built for
    // every Effect-form Worker) crashes on `stdin.once` at isolate init.
    compatibility: { date: "2026-03-17", flags: ["nodejs_compat"] },
    dev: { port: DEV_API_PORT },
    // The built SPA. Assets are served first for everything that is not
    // /api/*; unknown paths fall back to index.html (SPA routing). The
    // committed dist/ placeholder keeps first-run `alchemy dev` working
    // before any `vite build`.
    assets: {
      directory: "./examples/reef/dist",
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/api/*"],
    },
  },
  Effect.gen(function* () {
    const auth = yield* BetterAuth({
      basePath: AUTH_BASE_PATH,
      emailAndPassword: { enabled: true },
      // The Vite dev server proxies /api here, so browser-visible origins are
      // the Vite origin (dev) and the Worker's own origin (deployed assets).
      trustedOrigins: [DEV_UI_ORIGIN],
      // The demo ships no mailer, so accounts are auto-verified at creation —
      // otherwise the organization plugin's listUserInvitations 403s every
      // fresh account (EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION, an
      // unconditional check in Better Auth 1.6).
      databaseHooks: {
        user: {
          create: {
            before: async (user) => ({ data: { ...user, emailVerified: true } }),
          },
        },
      },
      plugins: [
        organization({
          ac,
          roles,
          // Invitations are in-app only: invitees see them on their next
          // sign-in via listUserInvitations. Nothing to send.
          async sendInvitationEmail() {},
        }),
        jwt({
          jwt: {
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
            expirationTime: `${JWT_TTL_SECONDS}s`,
          },
        }),
      ],
    });

    /**
     * `POST /api/ripple-token { workspace }` → `{ token, class, exp }`.
     *
     * The session cookie authenticates the caller; their membership in the
     * org whose slug is `workspace` decides the class; `signJWT` (server-only,
     * same JWKS key the /api/auth/jwks endpoint publishes) mints the claim
     * set the Ripple peer verifies (docs/AUTH_LAYER.md §1).
     */
    const rippleToken = Effect.gen(function* () {
      const session = yield* auth.getSession();
      if (session === null) {
        return yield* json({ error: "not signed in" }, 401);
      }
      const request = yield* HttpServerRequest.HttpServerRequest;
      const body = (yield* request.json.pipe(
        Effect.catchCause(() => Effect.succeed(null)),
      )) as { workspace?: unknown } | null;
      const workspace = body?.workspace;
      if (typeof workspace !== "string" || !SLUG_RE.test(workspace)) {
        return yield* json({ error: "workspace must be a valid slug" }, 400);
      }

      const webRequest = yield* HttpServerRequest.toWeb(request).pipe(Effect.orDie);
      // Requires membership: a non-member gets a Better Auth error, mapped
      // to 403 below — the token route never leaks whether the org exists.
      const org = yield* auth.api
        .getFullOrganization({
          query: { organizationSlug: workspace },
          headers: webRequest.headers,
        })
        .pipe(Effect.catchTag("BetterAuthApiError", () => Effect.succeed(null)));
      const member = org?.members.find((m) => m.userId === session.user.id);
      if (member === undefined) {
        return yield* json({ error: "not a member of this workspace" }, 403);
      }

      const cls = classOfRole(member.role);
      const iat = Math.floor(Date.now() / 1000);
      const exp = iat + JWT_TTL_SECONDS;
      const { token } = yield* auth.api
        .signJWT({
          body: {
            payload: {
              sub: session.user.id,
              iat,
              exp,
              ripple: { db: workspace, class: cls },
            },
          },
        })
        .pipe(Effect.orDie);
      return yield* json({ token, class: cls, exp });
    }).pipe(
      // Session-lookup failures (bad cookie, storage hiccough) render as the
      // API error they are instead of escaping the Worker's HttpEffect type.
      Effect.catchTag("BetterAuthApiError", (error) =>
        json({ error: error.body?.message ?? "auth error" }, error.statusCode),
      ),
    );

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const path = request.url.split("?")[0] ?? "/";
        if (path.startsWith(`${AUTH_BASE_PATH}/`)) {
          return yield* auth.fetch;
        }
        if (path === "/api/ripple-token" && request.method === "POST") {
          return yield* rippleToken;
        }
        if (path === "/api/health") {
          return yield* json({ ok: true });
        }
        return yield* json({ error: "not found" }, 404);
      }),
    };
  }).pipe(Effect.provide(CloudflareD1(AuthDb))),
);

export default Api;
