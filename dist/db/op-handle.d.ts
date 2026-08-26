/**
 * Build an `Op` handle: transaction verbs via {@link txBuilder}, plus the
 * injected reads / effect / principal. Shared by the client overlay and
 * the peer Worker so both sides run the same body.
 */
import * as Effect from "effect/Effect";
import type { AnySchema } from "./Schema.ts";
import { type DbError } from "./Errors.ts";
import { type AnyOperation, type Op, type OpPrincipal, type RuntimeOp } from "./Operation.ts";
import type { AnyQueryObject } from "./query/index.ts";
export interface OpHandleOptions {
    readonly schema: AnySchema;
    readonly db: string;
    readonly principal: OpPrincipal;
    readonly self?: unknown;
    readonly q: (input: AnyQueryObject) => Effect.Effect<unknown, DbError>;
    readonly pull: (subject: unknown, pattern: unknown) => Effect.Effect<unknown, DbError>;
    /**
     * `"halt"` — client prefix: `op.effect` dies with {@link PrefixHalt}
     * (a defect, not a typed failure — the body never names it).
     * `"run"` — server: evaluate the thunk with `ctx`.
     */
    readonly effects: "halt" | "run";
    readonly effectCtx?: {
        readonly env: unknown;
        readonly databases: {
            install(schema: AnySchema, name?: string): Effect.Effect<unknown, DbError>;
        };
    };
}
export interface BuiltOp {
    readonly op: RuntimeOp;
    readonly ops: () => readonly unknown[];
}
/** Narrow a pull subject to an engine entity ref without a channel cast. */
export declare const entityRefOf: (subject: unknown) => number | string | [string, unknown];
export declare const buildOp: (options: OpHandleOptions) => BuiltOp;
/** Wrap the Effect runtime handle as the async `Op` a body sees. */
export declare const asPromiseOp: (op: RuntimeOp) => Op<any, any>;
/** Run a body, treating a {@link PrefixHalt} as a successful prefix stop. */
export declare const runBody: (operation: Pick<AnyOperation, "body">, op: RuntimeOp, input: unknown) => Effect.Effect<{
    output: unknown;
    halted: boolean;
}, unknown>;
//# sourceMappingURL=op-handle.d.ts.map