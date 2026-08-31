import { Db } from "../db.ts";
import type { PullAttrSpec, PullPattern } from "./ast.ts";
export declare function pull(db: Db, eid: number, pattern: PullPattern | string | unknown[]): Promise<Record<string, unknown> | null>;
export declare function pullMany(db: Db, eids: readonly number[], pattern: PullPattern | string | unknown[]): Promise<(Record<string, unknown> | null)[]>;
export declare function normalizePullPattern(p: unknown): PullPattern;
export type { PullAttrSpec };
//# sourceMappingURL=pull.d.ts.map