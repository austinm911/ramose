/** Entity id wrapper — `.pull(...)` lives here, not on `db`. */

import type { RuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import type { DatabaseError } from "../DatabaseTypes.ts";
import type { AnyCatalog } from "./Catalog.ts";
import type { IdentPullPattern, PullResult, ValidatePull } from "./Pull.ts";

const die = <A, E = never, R = RuntimeContext>(
  what: string,
): Effect.Effect<A, E, R> =>
  Effect.die(
    new Error(`ripple/schema: proposal stub — ${what} (no peer I/O)`),
  );

export interface Eid<C extends AnyCatalog = AnyCatalog> {
  readonly _tag: "Eid";
  readonly id: number;
  readonly catalog: C;
  /** Literate pull map, or ident-keyed array as the escape. */
  pull<const P>(
    pattern: [P] extends [readonly unknown[]]
      ? P & IdentPullPattern<C>
      : ValidatePull<C, P>,
  ): Effect.Effect<PullResult<C, P> | null, DatabaseError, RuntimeContext>;
}

export const makeEid = <C extends AnyCatalog>(
  catalog: C,
  id: number,
): Eid<C> => ({
  _tag: "Eid",
  id,
  catalog,
  pull: () => die("pull"),
});

export const isEid = (value: unknown): value is Eid =>
  typeof value === "object" &&
  value !== null &&
  (value as { _tag?: unknown })._tag === "Eid" &&
  "id" in value &&
  "pull" in value;

/** Wrap a known eid. Query `find` already returns wrappers. */
export const Eid = {
  of: <C extends AnyCatalog>(catalog: C, id: number): Eid<C> =>
    makeEid(catalog, id),
};
