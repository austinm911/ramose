/** One Ripple client per open workspace. The mint is the `@ripple/better-auth`
 * client plugin (`authClient.ripple.token`); `Ripple.token.jwt` re-mints the
 * JWT near `exp`; `cls` is the decoded, unverified claim — UI hints only. */
import * as Ripple from "@ripple/alchemy/db";
import type { ReefDb } from "../domain/queries.ts";
import { Reef } from "../domain/schema.ts";
import type { RippleClass } from "../domain/shared.ts";
import { authClient } from "./auth.ts";

export interface Workspace {
  readonly slug: string;
  readonly cls: RippleClass;
  readonly db: ReefDb;
  readonly close: () => Promise<void>;
}

export const openWorkspace = async (slug: string): Promise<Workspace> => {
  const source = Ripple.token.jwt(() => authClient.ripple.token({ db: slug }));
  const url = import.meta.env.VITE_RIPPLE_URL ?? "http://localhost:1337";
  const ripple = Ripple.connect({ url, token: source });
  const cls = ((await source.claims()).ripple?.class ?? "viewer") as RippleClass;
  return { slug, cls, db: ripple.db(slug, Reef), close: ripple.close };
};
