/** One Ripple client per open workspace. `Ripple.token.jwt` re-mints the JWT
 * near `exp`; `cls` is the decoded, unverified claim — UI hints only. */
import * as Ripple from "@ripple/alchemy/db";
import type { ReefDb } from "../domain/queries.ts";
import { Reef } from "../domain/schema.ts";
import type { RippleClass } from "../domain/shared.ts";

export interface Workspace {
  readonly slug: string;
  readonly cls: RippleClass;
  readonly db: ReefDb;
  readonly close: () => Promise<void>;
}

export const openWorkspace = async (slug: string): Promise<Workspace> => {
  const source = Ripple.token.jwt(async () => {
    const res = await fetch("/api/ripple-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: slug }),
    });
    const body = (await res.json()) as { token: string; error?: string };
    if (!res.ok) throw new Error(body.error ?? `mint failed (${res.status})`);
    return body;
  });
  const url = import.meta.env.VITE_RIPPLE_URL ?? "http://localhost:1337";
  const ripple = Ripple.connect({ url, token: source });
  const cls = ((await source.claims()).ripple?.class ?? "viewer") as RippleClass;
  return { slug, cls, db: ripple.db(slug, Reef), close: ripple.close };
};
