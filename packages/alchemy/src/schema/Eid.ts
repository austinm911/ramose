/**
 * An entity id as a wrapper you `.pull(...)` on.
 *
 * A `find` var bound in the entity slot, or against a `:db.type/ref`
 * attr, is this — not a bare `number`. String / long bindings stay
 * primitives. There is one pull API: the wrapper. `db.pull` is gone.
 *
 * ```ts
 * const rows = yield* db.q((q) =>
 *   q.where("?e", User.name, "?n").find("?e", "?n"),
 * )
 * const ada = yield* rows[0][0].pull({
 *   name: User.name,
 *   age: User.age.optional,
 *   friends: User.friends.with({ name: User.name }),
 * })
 * ```
 *
 * A known number wraps the same way: `Eid.of(Movies, 1001).pull({ ... })`.
 */

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
  /**
   * Project this entity. Same literate map as before: keys are the
   * names that come back, values are attr refs, `attr.optional`, or
   * `attr.with({ ... })`. Ident-keyed arrays stay as the escape.
   */
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

/**
 * Wrap a known eid so you can `.pull` without a client method.
 * Query `find` already returns wrappers; this is the known-number door.
 */
export const Eid = {
  of: <C extends AnyCatalog>(catalog: C, id: number): Eid<C> =>
    makeEid(catalog, id),
};
