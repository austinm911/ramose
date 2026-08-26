/**
 * `usePull` — a standing `db.livePull(subject, pattern)` as `Live` state:
 * `rows` is the projection or `null` (a retract is an emission, not an end),
 * and a pinned view emits once, completes, and keeps its rows.
 *
 * The view, the `subject`, and the `pattern` are structural —
 * `db.asOf(t)` and `{ id: 17 }` written inline are fine, and a render-fresh
 * `{ title: Todo.title }` is the same pull as a hoisted one.
 */

import type {
  Schema,
  DbError,
  EntityRef,
  IdentPullPattern,
  Pull,
  ReadDb,
  ValidatePull,
} from "../db/index.ts";
import { pullPatternKey } from "../db/astKey.ts";
import type * as Stream from "effect/Stream";
import { useMemo } from "octane";
import { type Live, useLive } from "./useLive.ts";
import { viewDep } from "../react/seam.ts";
import { splitSlot, subSlot } from "./internal.ts";

/** The pattern a subject accepts — the same rule as `db.pull` / `db.livePull`. */
type PullPattern<C extends Schema.Any, P> = [P] extends [readonly unknown[]]
  ? P & IdentPullPattern<C>
  : ValidatePull<C, P>;

/**
 * The subject, flattened to the coordinates the wire would see: `{ id }` to
 * the id, a lookup ref to `[ident, value]` whichever way its head is spelled.
 */
const subjectKey = (subject: unknown): string => {
  if (Array.isArray(subject) && subject.length === 2) {
    const head: unknown = subject[0];
    const ident =
      typeof head === "object" && head !== null && "ident" in head
        ? (head as { ident: unknown }).ident
        : head;
    return JSON.stringify([ident, subject[1]]);
  }
  const id = (subject as { id?: unknown } | null)?.id;
  return JSON.stringify(id ?? subject);
};

export function usePull<C extends Schema.Any, const P>(
  db: ReadDb<C>,
  subject: EntityRef<C>,
  pattern: PullPattern<C, P>,
): Live<Pull<C, P> | null>;
export function usePull<C extends Schema.Any, const P>(
  db: ReadDb<C>,
  subject: EntityRef<C>,
  pattern: PullPattern<C, P>,
  ...rest: [slot?: symbol]
): Live<Pull<C, P> | null> {
  const [, slot] = splitSlot(rest);
  const view = viewDep(db);
  const key = subjectKey(subject);
  const patternKey = pullPatternKey(pattern);
  const stream: Stream.Stream<Pull<C, P> | null, DbError> = useMemo(
    () => db.effect.livePull<P>(subject, pattern),
    [view, key, patternKey],
    subSlot(slot, "pull:stream"),
  );
  return useLive(stream, subSlot(slot, "pull:live"));
}
