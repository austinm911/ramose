/**
 * Server-side operation execution: resolve, decode, run the full body
 * (effects included), accumulate one transaction.
 */
import { type Principal } from "../internal/core/index.ts";
import { type RamoseEnv } from "../internal/transactor/index.ts";
import { type AnyOperation, type AnyOperations } from "../db/Operation.ts";
import { checkWrite } from "./auth.ts";
import type { WritesMode } from "../writes.ts";
export interface ServerOptions {
    readonly operations?: AnyOperations;
    readonly writes?: WritesMode;
}
export declare const lookupOperation: (registry: AnyOperations | undefined, name: string) => AnyOperation | undefined;
export interface ExecuteArgs {
    readonly env: RamoseEnv;
    readonly request: Request;
    readonly db: string;
    readonly principal: Principal;
    readonly registry: AnyOperations | undefined;
    readonly name: string;
    readonly entity: unknown;
    readonly input: unknown;
    readonly clientOpId?: string;
}
export interface ExecuteReady {
    readonly tx: unknown[];
    /** Raw body return — live handles, not wire-encoded. Use `encodeOutput`. */
    readonly output: unknown;
    readonly principal: Principal;
    readonly clientOpId?: string;
    /** Resolve handles against the commit's tempid map, then encode. */
    encodeOutput(tempids: Readonly<Record<string, number>>): Promise<unknown>;
}
export declare function prepareOperation(args: ExecuteArgs): Promise<ExecuteReady>;
export { checkWrite };
//# sourceMappingURL=operations.d.ts.map