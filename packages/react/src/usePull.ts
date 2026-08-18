/**
 * `usePull` — a standing `db.livePull(subject, pattern)` as React state.
 *
 * The same `Live` shape (and the same engine) as `useLive`: `rows` is the
 * projection or `null` (a retracted entity is a legitimate emission, not an
 * end), `ticks` counts the re-emissions, `error` is the stream's terminal
 * failure. Over a pinned view (`asOf` / `history`) the stream emits once
 * and completes, and the last `rows` stay.
 *
 * The subscription re-keys on the view (structural, via the seam), on the
 * `subject` compared **structurally** — `{ id: 17 }` or a lookup ref written
 * inline is fine — and on `pattern` identity, so hoist the pattern exactly
 * as you hoist a query.
 */

import type {
  Catalog,
  DbError,
  Eid,
  IdentPullPattern,
  LookupRef,
  Pull,
  ReadDb,
  ValidatePull,
} from "@ripple/alchemy/db";
import type * as Stream from "effect/Stream";
import { useMemo } from "react";
import { type Live, useLive } from "./useLive.ts";
import { viewDep } from "./seam.ts";

/** The pattern a subject accepts — the same rule as `db.pull` / `db.livePull`. */
type PullPattern<C extends Catalog.Any, P> = [P] extends [readonly unknown[]]
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

export const usePull = <C extends Catalog.Any, const P>(
  db: ReadDb<C>,
  subject: Eid<C> | LookupRef<C>,
  pattern: PullPattern<C, P>,
): Live<Pull<C, P> | null> => {
  const view = viewDep(db);
  const key = subjectKey(subject);
  const stream: Stream.Stream<Pull<C, P> | null, DbError> = useMemo(
    () => db.livePull<P>(subject, pattern),
    // `db` and `subject` enter through their structural stand-ins: a fresh
    // but equal view or `{ id }` literal must not tear the subscription down
    [view, key, pattern],
  );
  // `useLive`'s stream form is the package's one subscription engine
  return useLive(stream);
};
