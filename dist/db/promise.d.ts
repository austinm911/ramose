/**
 * Run an Effect as a Promise that rejects with the tagged failure itself
 * (not a FiberFailure / Cause wrapper). Defects squash to the defect value.
 *
 * @internal
 */
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import type { Subscription } from "./subscription.ts";
/** The typed failure when there is one; the squashed defect otherwise. */
export declare const failureOf: (cause: Cause.Cause<unknown>) => unknown;
export declare const asPromise: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
/** Sync twin of {@link asPromise} — throws the tagged failure, not FiberFailure. */
export declare const runSync: <A, E>(effect: Effect.Effect<A, E>) => A;
/**
 * Hatch-only: run an Effect from `db.effect.*` so the Promise rejects with
 * the tagged error itself (not a FiberFailure). App-path methods already
 * do this — use `try/catch` there. Documented on the Effect hatch page.
 */
export declare const runPromise: typeof asPromise;
/**
 * Drive a Stream as a {@link Subscription}. Interrupt on `close()`. A
 * completion (pinned `asOf` / `history`) ends iteration without error.
 */
export declare const fromStream: <A, E>(stream: Stream.Stream<A, E>) => Subscription<A, E>;
//# sourceMappingURL=promise.d.ts.map