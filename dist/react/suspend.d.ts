/**
 * First-emission / first-run thenables for `{ suspense: true }`.
 *
 * Suspense cannot wait on a `useEffect` — the component is not committed
 * while it throws, so the effect never starts. These helpers begin the
 * work during render, keyed on the same structural identity the hooks
 * already use, and stash the first value so the remount hydrates.
 */
import type { Subscription } from "../db/index.ts";
type Thenable<A> = Promise<A> & {
    status: "pending" | "fulfilled" | "rejected";
    value?: A;
    reason?: unknown;
};
export interface SuspendSlot<A, E> {
    promise: Thenable<A>;
    data?: A;
    t?: number;
    error?: E;
    /** Tear down a pending live acquire. Idempotent; settled slots are already released. */
    release?: () => void;
}
export declare const peekSuspend: <A, E>(key: string) => SuspendSlot<A, E> | undefined;
export declare const evictSuspend: (key: string) => void;
/**
 * Drop a slot after the current React flush. Used when throwing a
 * terminal error: the same tick's replay still sees the cached failure
 * (so we do not replace it with a pending promise and hang Suspense),
 * and the next mount re-acquires.
 */
export declare const retireSuspend: (key: string) => void;
/**
 * First emission of a standing read. `acquire` runs on the first call
 * per key; the handle is closed after that emission so the hook's
 * effect can own the live subscription.
 */
export declare const ensureLive: <A, E>(key: string, acquire: () => {
    readonly sub: Subscription<A, E>;
    readonly owned: boolean;
}) => SuspendSlot<A, E>;
/** First settlement of a one-shot `run()`. */
export declare const ensureOneShot: <A, E>(key: string, run: () => Promise<A>, basis: () => number | undefined) => SuspendSlot<A, E>;
export {};
//# sourceMappingURL=suspend.d.ts.map