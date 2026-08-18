/**
 * `@ripple/better-auth/client` — the browser half of the mint route.
 *
 * `rippleTokenClient()` gives the auth client one action,
 * `authClient.ripple.token({ db })`, resolving to the mint route's body
 * `{ token, class, exp }` — exactly what `Ripple.token.jwt` accepts:
 *
 * ```typescript
 * const authClient = createAuthClient({ plugins: [rippleTokenClient()] });
 * const source = Ripple.token.jwt(() => authClient.ripple.token({ db: slug }));
 * const runtime = ManagedRuntime.make(Ripple.layer({ url, token: source }));
 * ```
 *
 * Failure typing matches what `token.jwt` documents: a 401/403 from the mint
 * route (not signed in, not a member) throws Ripple's `Unauthorized`, which
 * passes through `token.jwt` untouched and fails a standing `live`
 * *terminally* — retrying cannot help until the user signs in again. Any
 * other failure throws a plain `Error`, which `token.jwt` wraps in
 * `NetworkError` and the transports retry as transient.
 */

import { Unauthorized } from "@ripple/alchemy/db";
import type { BetterAuthClientPlugin } from "better-auth";

type ClientFetch = Parameters<
  NonNullable<BetterAuthClientPlugin["getActions"]>
>[0];

/** The mint route's body — `Ripple.token.jwt` accepts it unchanged. */
export interface RippleTokenResult {
  readonly token: string;
  /** The caller's `ripple.class` — role-aware chrome, never authorization. */
  readonly class: string;
  /** `exp` of the JWT, seconds since epoch (also inside the token itself). */
  readonly exp: number;
}

export interface RippleTokenClientOptions {
  /** Must match the server plugin's `path`. @default "/ripple/token" */
  readonly path?: string;
}

/** The client plugin pairing with `rippleToken` on the server. */
export const rippleTokenClient = (options?: RippleTokenClientOptions) => {
  const path = options?.path ?? "/ripple/token";
  return {
    id: "ripple-token",
    getActions: ($fetch: ClientFetch) => ({
      ripple: {
        token: async (
          input: { readonly db: string },
          fetchOptions?: { readonly headers?: HeadersInit },
        ): Promise<RippleTokenResult> => {
          const { data, error } = await $fetch<RippleTokenResult>(path, {
            method: "POST",
            body: { db: input.db },
            ...fetchOptions,
          });
          if (error) {
            const message =
              error.message ?? `ripple: token mint failed (${error.status})`;
            if (error.status === 401 || error.status === 403) {
              throw new Unauthorized({ message });
            }
            throw new Error(message);
          }
          return data as RippleTokenResult;
        },
      },
    }),
  } satisfies BetterAuthClientPlugin;
};
