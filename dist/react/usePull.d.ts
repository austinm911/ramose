/**
 * `useLivePull` — a live `db.livePull(subject, pattern)` as `Read` state:
 * `data` is the projection or `null` (a retract is an emission, not an end),
 * and a pinned view emits once, completes, and keeps its data.
 *
 * `usePull` — the one-shot twin: one `db.pull` per view / subject / pattern.
 *
 * Three coordinates are structural: the view (`db.asOf(t)`), the `subject`
 * (a branded cell, number, or lookup ref), and the `pattern` (canonical
 * JSON of `lowerPullPattern`). A render-fresh `{ title: Todo.title }` is
 * the same pull as a hoisted one. Changing the subject blanks `data` on
 * the live hook until the new pull lands; the one-shot keeps the previous
 * `data` while the next run is in flight.
 *
 * `initialData` hydrates this key so a server pull can paint on the first
 * client render. `{ suspense: true }` throws until the first answer.
 */
import type { Schema, DbError, EntityRef, IdentPullPattern, Pull, ReadDb, ValidatePull } from "../db/index.ts";
import { type Read, type ReadOptions, type SuspendedRead } from "./read.ts";
/** The pattern a subject accepts — the same rule as `db.pull` / `db.livePull`. */
type PullPattern<C extends Schema.Any, P> = [P] extends [readonly unknown[]] ? P & IdentPullPattern<C> : ValidatePull<C, P>;
type PullOut<C extends Schema.Any, P> = Pull<C, P> | null;
export declare function useLivePull<C extends Schema.Any, const P>(db: ReadDb<C>, subject: EntityRef<C>, pattern: PullPattern<C, P>, options: ReadOptions<PullOut<C, P>> & {
    suspense: true;
}): SuspendedRead<PullOut<C, P>, DbError>;
export declare function useLivePull<C extends Schema.Any, const P>(db: ReadDb<C>, subject: EntityRef<C>, pattern: PullPattern<C, P>, options?: ReadOptions<PullOut<C, P>>): Read<PullOut<C, P>, DbError>;
export declare function usePull<C extends Schema.Any, const P>(db: ReadDb<C>, subject: EntityRef<C>, pattern: PullPattern<C, P>, options: ReadOptions<PullOut<C, P>> & {
    suspense: true;
}): SuspendedRead<PullOut<C, P>, DbError>;
export declare function usePull<C extends Schema.Any, const P>(db: ReadDb<C>, subject: EntityRef<C>, pattern: PullPattern<C, P>, options?: ReadOptions<PullOut<C, P>>): Read<PullOut<C, P>, DbError>;
export {};
//# sourceMappingURL=usePull.d.ts.map