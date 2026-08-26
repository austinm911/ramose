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
import { useCallback, useEffect, useMemo, useRef, useState } from "octane";
import { splitSlot, subSlot } from "./internal.js";
/** Entity argument → invocation key (number, `{ id }`, or the value). */
const invocationKey = (value) => {
    if (typeof value === "number")
        return value;
    if (typeof value === "object" &&
        value !== null &&
        "id" in value &&
        typeof value.id === "number") {
        return value.id;
    }
    return value;
};
export function useOperation(db, operation, ...rest) {
    const [args, slot] = splitSlot(rest);
    const options = args[0];
    const [inFlight, setInFlight] = useState(0, subSlot(slot, "op:in-flight"));
    const [pendingKeys, setPendingKeys] = useState(() => new Map(), subSlot(slot, "op:pending-keys"));
    const [error, setError] = useState(undefined, subSlot(slot, "op:error"));
    const [errors, setErrors] = useState(() => new Map(), subSlot(slot, "op:errors"));
    const mounted = useRef(true, subSlot(slot, "op:mounted"));
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, [], subSlot(slot, "op:mount"));
    const onErrorRef = useRef(options?.onError, subSlot(slot, "op:on-error"));
    onErrorRef.current = options?.onError;
    const run = useCallback(async (a, b) => {
        const key = invocationKey(a);
        if (mounted.current) {
            setInFlight((n) => n + 1);
            setPendingKeys((prev) => {
                const next = new Map(prev);
                next.set(key, (next.get(key) ?? 0) + 1);
                return next;
            });
        }
        try {
            const value = operation.on !== undefined
                ? await db.run(operation, a, b)
                : await db.run(operation, a);
            if (mounted.current) {
                setError(undefined);
                setErrors((prev) => {
                    if (!prev.has(key))
                        return prev;
                    const next = new Map(prev);
                    next.delete(key);
                    return next;
                });
            }
            return { ok: true, value };
        }
        catch (failure) {
            const err = failure;
            if (mounted.current) {
                setError(err);
                setErrors((prev) => {
                    const next = new Map(prev);
                    next.set(key, err);
                    return next;
                });
            }
            onErrorRef.current?.(err);
            return { ok: false, error: err };
        }
        finally {
            if (mounted.current) {
                setInFlight((n) => n - 1);
                setPendingKeys((prev) => {
                    const next = new Map(prev);
                    const left = (next.get(key) ?? 1) - 1;
                    if (left <= 0)
                        next.delete(key);
                    else
                        next.set(key, left);
                    return next;
                });
            }
        }
    }, [db, operation], subSlot(slot, "op:run"));
    const pendingFor = useCallback((key) => (pendingKeys.get(key) ?? 0) > 0, [pendingKeys], subSlot(slot, "op:pending-for"));
    const errorFor = useCallback((key) => errors.get(key), [errors], subSlot(slot, "op:error-for"));
    const clearError = useCallback(() => {
        setError(undefined);
        setErrors(new Map());
    }, [], subSlot(slot, "op:clear"));
    const pending = inFlight > 0;
    return useMemo(() => ({ run, pending, pendingFor, error, errorFor, clearError }), [run, pending, pendingFor, error, errorFor, clearError], subSlot(slot, "op:result"));
}
//# sourceMappingURL=useOperation.js.map