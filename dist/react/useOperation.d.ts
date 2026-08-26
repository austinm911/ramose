/**
 * `useOperation(db, op)` — typed write hook for one operation. `run` matches
 * `db.run`: `(input)` or `(entity, input)`. Always resolves
 * `{ ok: true, value } | { ok: false, error }` so `void run(...)` is safe.
 *
 * Pending / error are per invocation key — contextual ops key on the entity
 * (the number, or `{ id }`), so two buttons on one hook instance can spinner
 * independently. `pending` / `error` are the roll-up (any in flight / last
 * settler), the same shape `useTransact` used to expose as a global count.
 */
import type { AnyEntity, Db, OpReport, Operation, Schema } from "../db/index.ts";
import type { RunArg, RunEntity } from "../db/Operation.ts";
/** What `run` resolves — always, so `void run(...)` is safe. */
export type RunResult<A, E = unknown> = {
    readonly ok: true;
    readonly value: A;
} | {
    readonly ok: false;
    readonly error: E;
};
export interface OperationHandle<Run, E = unknown> {
    /**
     * Runs the operation. Always resolves — failure lands on `error` /
     * `errorFor` / `onError` and on the rejected half of the result, so
     * `void run(...)` is safe.
     */
    readonly run: Run;
    /** Any invocation from this hook is in flight. */
    readonly pending: boolean;
    /** This invocation key is in flight. Contextual ops key on the entity. */
    readonly pendingFor: (key: unknown) => boolean;
    /**
     * The last-settled failure — cleared when a run settles successfully.
     * Concurrent runs: the last settler wins.
     */
    readonly error: E | undefined;
    readonly errorFor: (key: unknown) => E | undefined;
    readonly clearError: () => void;
}
export type OperationOptions<E = unknown> = {
    onError?: (error: E) => void;
};
type NonContextualRun<C extends Schema.Any, I, O, OC extends Schema.Any, E> = (input: RunArg<C, OC, I>) => Promise<RunResult<OpReport<O, C>, E>>;
type ContextualRun<C extends Schema.Any, I, O, N extends AnyEntity, OC extends Schema.Any, E> = (entity: RunArg<C, OC, RunEntity<C, N>>, input: I) => Promise<RunResult<OpReport<O, C>, E>>;
export declare function useOperation<C extends Schema.Any, I, O, OC extends Schema.Any = Schema.Any, E = unknown>(db: Db<C>, operation: Operation<string, I, O, undefined, OC>, options?: OperationOptions<E>): OperationHandle<NonContextualRun<C, I, O, OC, E>, E>;
export declare function useOperation<C extends Schema.Any, I, O, N extends AnyEntity, OC extends Schema.Any = Schema.Any, E = unknown>(db: Db<C>, operation: Operation<string, I, O, N, OC>, options?: OperationOptions<E>): OperationHandle<ContextualRun<C, I, O, N, OC, E>, E>;
export {};
//# sourceMappingURL=useOperation.d.ts.map