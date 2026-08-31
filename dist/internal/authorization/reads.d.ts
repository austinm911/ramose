import * as Effect from "effect/Effect";
import type { EntityRef } from "../core/db.ts";
import type { Db } from "../core/db.ts";
import { type QueryOptions } from "../core/query/engine.ts";
import { type AuthorizedRequestInput } from "./request.ts";
declare const OneShotReadError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "OneShotReadError";
} & Readonly<A>;
export declare class OneShotReadError extends OneShotReadError_base<{
    readonly cause: unknown;
}> {
}
export type OneShotQueryRead = {
    readonly kind: "query";
    readonly query: string | object;
    readonly inputs?: readonly unknown[];
};
export type OneShotPullRead = {
    readonly kind: "pull";
    readonly eid: EntityRef;
    readonly pattern: string | unknown[];
};
export type OneShotEntityRead = {
    readonly kind: "entity";
    readonly ref: EntityRef;
};
export type OneShotLookupRead = {
    readonly kind: "lookup";
    readonly ref: readonly [string, unknown];
};
export type OneShotRead = OneShotQueryRead | OneShotPullRead | OneShotEntityRead | OneShotLookupRead;
export type OneShotReadOptions = Pick<QueryOptions, "maxCells">;
export declare const runOneShotRead: (db: Db, read: OneShotRead, opts?: OneShotReadOptions) => Promise<unknown>;
export declare const executeAuthorizedRead: <R, EDb = unknown>(input: AuthorizedRequestInput<R, EDb>, read: OneShotRead, opts?: OneShotReadOptions) => Effect.Effect<unknown, EDb | OneShotReadError | import("../../index.ts").Unauthorized, R>;
export {};
//# sourceMappingURL=reads.d.ts.map