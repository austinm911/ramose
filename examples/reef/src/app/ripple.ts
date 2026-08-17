/**
 * One Ripple runtime per open workspace.
 *
 * A workspace is a database name; entering one means minting a
 * workspace-scoped JWT from the auth Worker and building a `Ripple.layer`
 * whose `token` Effect re-reads that mint. The client re-runs the Effect on
 * every (re)connect and every `/transact`, so 15-minute tokens refresh
 * themselves — there is no refresh plumbing anywhere else in the app.
 */

import * as Ripple from "@ripple/alchemy/db";
import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Redacted from "effect/Redacted";
import type { RippleClass } from "../domain/shared.ts";
import type { ReefDb } from "../domain/queries.ts";
import { Reef } from "../domain/schema.ts";

export const RIPPLE_URL: string =
  (import.meta.env.VITE_RIPPLE_URL as string | undefined) ??
  "http://localhost:1337";

/** Re-mint this many ms before `exp` so a token never expires mid-flight. */
const REFRESH_MARGIN_MS = 120_000;

interface Minted {
  readonly token: string;
  readonly class: RippleClass;
  readonly exp: number;
}

const mint = async (slug: string): Promise<Minted> => {
  const res = await fetch("/api/ripple-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace: slug }),
  });
  const body = (await res.json()) as Minted & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `token mint failed (${res.status})`);
  return body;
};

export interface Workspace {
  readonly slug: string;
  /** The caller's `ripple.class` in this workspace (role-aware UI). */
  readonly cls: RippleClass;
  readonly db: ReefDb;
  readonly run: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
  /** `GET /db/:slug/info` — the current basis `t` for the time-travel slider. */
  readonly info: () => Promise<{ readonly db: string; readonly t: number }>;
  readonly dispose: () => Promise<void>;
}

export const openWorkspace = async (slug: string): Promise<Workspace> => {
  let minted = await mint(slug);

  const fresh = async (): Promise<Minted> => {
    if (minted.exp * 1000 - Date.now() < REFRESH_MARGIN_MS) {
      minted = await mint(slug);
    }
    return minted;
  };

  const runtime = ManagedRuntime.make(
    Ripple.layer({
      url: RIPPLE_URL,
      token: Effect.promise(async () => Redacted.make((await fresh()).token)),
    }),
  );
  const db = runtime.runSync(Ripple.Databases).db(slug, Reef);

  return {
    slug,
    cls: minted.class,
    db,
    run: (effect) => runtime.runPromise(effect),
    info: async () => {
      const { token } = await fresh();
      const res = await fetch(
        `${RIPPLE_URL}/db/${encodeURIComponent(slug)}/info`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(`info failed (${res.status})`);
      // Non-admins get `{ db, t }`; admins get the peer's full report where
      // the basis lives under `transactor.t`. Normalise to one shape.
      const body = (await res.json()) as {
        db: string;
        t?: number;
        transactor?: { t: number };
      };
      return { db: body.db, t: body.t ?? body.transactor?.t ?? 0 };
    },
    dispose: () => runtime.dispose(),
  };
};
