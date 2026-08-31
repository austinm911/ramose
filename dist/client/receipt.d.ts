import type { InvocationId } from "../db/refs.ts";
import { type Subscription } from "./subscription.ts";
/**
 * Why the authoritative server refused an invocation it had.
 *
 * The code is the server's own opaque classification; it is reported so an
 * application can branch, never interpreted here.
 */
export declare class MutationRejectedError extends Error {
    readonly _tag: "MutationRejectedError";
    readonly code: string;
    constructor(code: string);
}
/**
 * One receipt's current state.
 *
 * A discriminated union, in the same style as the query snapshot, so a
 * framework adapter renders it with a `switch` and no second state machine.
 */
export type ReceiptState = {
    readonly status: "pending";
} | {
    readonly status: "queued";
} | {
    readonly status: "committed";
} | {
    readonly status: "rejected";
    readonly error: MutationRejectedError;
} | {
    readonly status: "failed";
    readonly error: Error;
};
/** What `db.mutate.…()` and `entity.mutate.…()` return. */
export interface Receipt extends Subscription<ReceiptState> {
    readonly invocation: InvocationId;
    readonly queued: Promise<void>;
    readonly committed: Promise<void>;
}
export declare class ReceiptDriver {
    private readonly store;
    private settleQueued;
    private failQueued;
    private settleCommitted;
    private failCommitted;
    readonly receipt: Receipt;
    constructor(invocation: InvocationId);
    private get settled();
    queue(): void;
    commit(): void;
    reject(code: string): void;
    fail(error: Error): void;
}
//# sourceMappingURL=receipt.d.ts.map