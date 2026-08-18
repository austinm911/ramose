/**
 * Workspace wiring. The mint is the `@ripple/better-auth` client plugin
 * (`authClient.ripple.token`); `Ripple.token.jwt` re-mints the JWT near
 * `exp`; `cls` is the decoded, unverified claim — UI hints only. The client
 * that lives with the board is owned by `<RippleProvider key={slug}>` in
 * App.tsx; this module only runs the first-entry writes over a short-lived
 * one and hands the screens `{ slug, cls, token, myEid }`.
 */
import * as Ripple from "@ripple/alchemy/db";
import * as Effect from "effect/Effect";
import { Reef } from "../domain/schema.ts";
import type { RippleClass } from "../domain/shared.ts";
import { authClient } from "./auth.ts";
import { ensureSelf, provisionWorkspace } from "./mutations.ts";

export const RIPPLE_URL =
  import.meta.env.VITE_RIPPLE_URL ?? "http://localhost:1337";

export interface Workspace {
  readonly slug: string;
  readonly cls: RippleClass;
  /** Stable for the workspace's lifetime — `RippleProvider` keys its client on it. */
  readonly token: Ripple.TokenSource;
  /** The caller's `user` eid in this workspace (`undefined` for viewers). */
  readonly myEid: number | undefined;
}

/**
 * Mint the source, then run the one-time writes — `install()` + seeds when
 * `provision`, and the caller's own `user` row — over a client closed before
 * the board mounts.
 */
export const openWorkspace = async (
  slug: string,
  user: { id: string; name: string; email: string },
  provision: boolean,
): Promise<Workspace> => {
  const token = Ripple.token.jwt(() => authClient.ripple.token({ db: slug }));
  const cls = ((await token.claims()).ripple?.class ?? "viewer") as RippleClass;
  const ripple = Ripple.connect({ url: RIPPLE_URL, token });
  try {
    const db = ripple.db(slug, Reef);
    if (provision) await Effect.runPromise(provisionWorkspace(db, user));
    const myEid = await Effect.runPromise(
      ensureSelf(db, user, cls !== "viewer"),
    );
    return { slug, cls, token, myEid };
  } finally {
    await ripple.close();
  }
};
