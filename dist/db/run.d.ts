/**
 * `db.run` — decode input, run the optimistic prefix, queue the invocation.
 */
import * as Effect from "effect/Effect";
import type { AnySchema } from "./Schema.ts";
import type { Db, Wire } from "./Db.ts";
import { type DbError, InvalidRequest } from "./Errors.ts";
import { type AnyOperation, type OpReport } from "./Operation.ts";
export interface OverlayOpAck {
    readonly t: number;
    readonly txEid: number;
    readonly datomCount: number;
    readonly output: unknown;
    readonly clientOpId: string;
}
interface RunView {
    readonly asOf?: number;
    readonly history?: boolean;
    readonly minT?: number;
}
export declare const runOperation: <C extends AnySchema, O>(wire: Wire, name: string, schema: C, view: RunView, bad: InvalidRequest | undefined, operation: AnyOperation, entityArg: unknown, inputArg: unknown, make: (wire: Wire, name: string, schema: C, view: RunView) => Db<C>) => Effect.Effect<OpReport<O, C>, DbError>;
export {};
//# sourceMappingURL=run.d.ts.map