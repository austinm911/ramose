/**
 * Pull: declarative, nested entity projection.
 *
 *   [*]                                     every attribute (+ :db/id); refs as {:db/id n}
 *   [:user/name :user/email]                selected attributes
 *   [{:user/friends [:user/name]}]          nested pull through refs
 *   [:user/_friends]                        reverse refs (entities pointing here)
 *   [(:user/name :as "name") (limit :user/friends 5) (default :user/age 0)]
 *   [{:user/friends ...}]                    recursive (cycle-safe), or a depth number
 *
 * A cardinality-many attribute (forward ref, backlink or scalar) may also
 * carry `where` / `order` / `offset` / `limit` — see {@link PullElemPred}.
 * They run in that order, on the collection only: a nested collection that
 * filters to nothing is omitted (or takes its `default`); it never removes the
 * entity the pull is rooted at, so an outer `:limit` still returns its rows.
 */
import { Db } from "../db.ts";
import type { PullAttrSpec, PullPattern } from "./ast.ts";
export declare function pull(db: Db, eid: number, pattern: PullPattern | string | unknown[]): Promise<Record<string, unknown> | null>;
export declare function pullMany(db: Db, eids: readonly number[], pattern: PullPattern | string | unknown[]): Promise<(Record<string, unknown> | null)[]>;
export declare function normalizePullPattern(p: unknown): PullPattern;
export type { PullAttrSpec };
//# sourceMappingURL=pull.d.ts.map