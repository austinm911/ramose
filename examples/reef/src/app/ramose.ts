/** One Ramose client per open workspace. The mint is the `@ramose/better-auth`
 * client plugin (`authClient.ramose.token`); `Ramose.token.jwt` re-mints the
 * JWT near `exp`; `cls` is the decoded, unverified claim — UI hints only. */
import * as Ramose from "@ramose/alchemy/db";
import type { ReefDb } from "../domain/queries.ts";
import { Reef } from "../domain/schema.ts";
import type { RamoseClass } from "../domain/shared.ts";
import { authClient } from "./auth.ts";

export interface Workspace {
  readonly slug: string;
  readonly cls: RamoseClass;
  readonly db: ReefDb;
  readonly close: () => Promise<void>;
}

export const openWorkspace = async (slug: string): Promise<Workspace> => {
  const source = Ramose.token.jwt(() => authClient.ramose.token({ db: slug }));
  const url = import.meta.env.VITE_RAMOSE_URL ?? "http://localhost:1337";
  const ramose = Ramose.connect({ url, token: source });
  const cls = ((await source.claims()).ramose?.class ?? "viewer") as RamoseClass;
  return { slug, cls, db: ramose.db(slug, Reef), close: ramose.close };
};
