/**
 * `usePull` — a standing `db.livePull(subject, pattern)` as `Live` state:
 * `rows` is the projection or `null` (a retract is an emission, not an end),
 * and a pinned view emits once, completes, and keeps its rows.
 *
 * The view, the `subject`, and the `pattern` are structural —
 * `db.asOf(t)` and `{ id: 17 }` written inline are fine, and a render-fresh
 * `{ title: Todo.title }` is the same pull as a hoisted one.
 */
import type { Schema, EntityRef, IdentPullPattern, Pull, ReadDb, ValidatePull } from "../db/index.ts";
import { type Live } from "./useLive.ts";
/** The pattern a subject accepts — the same rule as `db.pull` / `db.livePull`. */
type PullPattern<C extends Schema.Any, P> = [P] extends [readonly unknown[]] ? P & IdentPullPattern<C> : ValidatePull<C, P>;
export declare function usePull<C extends Schema.Any, const P>(db: ReadDb<C>, subject: EntityRef<C>, pattern: PullPattern<C, P>): Live<Pull<C, P> | null>;
export {};
//# sourceMappingURL=usePull.d.ts.map