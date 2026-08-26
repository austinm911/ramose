/**
 * Run an Effect as a Promise that rejects with the tagged failure itself
 * (not a FiberFailure / Cause wrapper). Defects squash to the defect value.
 *
 * @internal
 */
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
/** The typed failure when there is one; the squashed defect otherwise. */
export const failureOf = (cause) => {
    const error = Cause.findErrorOption(cause);
    return Option.isSome(error) ? error.value : Cause.squash(cause);
};
export const asPromise = (effect) => Effect.runPromiseExit(effect).then((exit) => {
    if (Exit.isSuccess(exit))
        return exit.value;
    throw failureOf(exit.cause);
});
/** Sync twin of {@link asPromise} — throws the tagged failure, not FiberFailure. */
export const runSync = (effect) => {
    const exit = Effect.runSyncExit(effect);
    if (Exit.isSuccess(exit))
        return exit.value;
    throw failureOf(exit.cause);
};
/**
 * Hatch-only: run an Effect from `db.effect.*` so the Promise rejects with
 * the tagged error itself (not a FiberFailure). App-path methods already
 * do this — use `try/catch` there. Documented on the Effect hatch page.
 */
export const runPromise = asPromise;
/**
 * Drive a Stream as a {@link Subscription}. Interrupt on `close()`. A
 * completion (pinned `asOf` / `history`) ends iteration without error.
 */
export const fromStream = (stream) => {
    const listeners = new Set();
    // Last emission only — a standing live must not retain every pass.
    let latest;
    let hasLatest = false;
    let error;
    let ended = false;
    let closed = false;
    let failed = false;
    let finished = false;
    const finish = (kind, err) => {
        if (finished)
            return;
        finished = true;
        if (kind === "error") {
            failed = true;
            error = err;
            for (const listener of listeners)
                listener.onError?.(error);
        }
        else {
            ended = true;
            for (const listener of listeners)
                listener.onEnd?.();
        }
    };
    const fiber = Effect.runFork(Stream.runForEach(stream, (value) => Effect.sync(() => {
        latest = value;
        hasLatest = true;
        for (const listener of listeners)
            listener.onValue(value);
    })).pipe(Effect.catchCause((cause) => Effect.sync(() => {
        if (Cause.hasInterrupts(cause))
            return;
        finish("error", failureOf(cause));
    })), Effect.andThen(Effect.sync(() => {
        if (!failed)
            finish("end");
    }))));
    const close = () => {
        if (closed)
            return;
        closed = true;
        // Fiber.interrupt does not run catchCause / onEnd, so parked
        // `for await` iterators would hang unless we wake them here.
        finish("end");
        Effect.runFork(Fiber.interrupt(fiber));
    };
    return {
        subscribe(onValue, onError) {
            if (hasLatest)
                onValue(latest);
            if (error !== undefined)
                onError?.(error);
            const listener = { onValue, onError };
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        [Symbol.asyncIterator]() {
            const queue = [];
            let notify;
            const push = (event) => {
                queue.push(event);
                notify?.();
                notify = undefined;
            };
            if (hasLatest)
                queue.push({ kind: "value", value: latest });
            if (error !== undefined)
                queue.push({ kind: "error", error });
            else if (ended)
                queue.push({ kind: "end" });
            const listener = {
                onValue: (value) => push({ kind: "value", value }),
                onError: (err) => push({ kind: "error", error: err }),
                onEnd: () => push({ kind: "end" }),
            };
            listeners.add(listener);
            return {
                async next() {
                    for (;;) {
                        const event = queue.shift();
                        if (event !== undefined) {
                            if (event.kind === "value")
                                return { value: event.value, done: false };
                            if (event.kind === "error")
                                throw event.error;
                            return { value: undefined, done: true };
                        }
                        if (closed)
                            return { value: undefined, done: true };
                        await new Promise((resolve) => {
                            notify = resolve;
                        });
                    }
                },
                async return() {
                    listeners.delete(listener);
                    close();
                    return { value: undefined, done: true };
                },
            };
        },
        close,
    };
};
//# sourceMappingURL=promise.js.map