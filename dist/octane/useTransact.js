/**
 * `useTransact` — run an Effect from an event handler, and know whether it
 * is running and whether it failed.
 *
 * Deliberately not tied to the provider: it runs whatever Effect the caller
 * built (`run(moveIssue(db, id, status, rank))`), so it composes with a
 * module-singleton `Db` just as well as with `useDb`.
 */
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import { useCallback, useEffect, useMemo, useRef, useState } from "octane";
import { splitSlot, subSlot } from "./internal.js";
/** The failure's error when there is one; the squashed cause (a defect) otherwise. */
const causeError = (cause) => {
    const failure = Cause.findErrorOption(cause);
    return Option.isSome(failure) ? failure.value : Cause.squash(cause);
};
export function useTransact(...rest) {
    const [args, slot] = splitSlot(rest);
    const options = args[0];
    const [inFlight, setInFlight] = useState(0, subSlot(slot, "transact:in-flight"));
    const [error, setError] = useState(undefined, subSlot(slot, "transact:error"));
    const mounted = useRef(true, subSlot(slot, "transact:mounted"));
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, [], subSlot(slot, "transact:mount"));
    // a ref so `run` stays referentially stable when the caller passes an
    // inline `onError` closure (the common spelling)
    const onErrorRef = useRef(options?.onError, subSlot(slot, "transact:on-error"));
    onErrorRef.current = options?.onError;
    const run = useCallback(async (effect) => {
        if (mounted.current)
            setInFlight((n) => n + 1);
        const exit = await Effect.runPromiseExit(effect);
        if (Exit.isFailure(exit)) {
            const failure = causeError(exit.cause);
            if (mounted.current)
                setError(failure);
            onErrorRef.current?.(failure);
        }
        else if (mounted.current) {
            setError(undefined);
        }
        if (mounted.current)
            setInFlight((n) => n - 1);
        return exit;
    }, [], subSlot(slot, "transact:run"));
    const clearError = useCallback(() => setError(undefined), [], subSlot(slot, "transact:clear"));
    const pending = inFlight > 0;
    return useMemo(() => ({ run, pending, error, clearError }), [run, pending, error, clearError], subSlot(slot, "transact:result"));
}
//# sourceMappingURL=useTransact.js.map