"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
export function useOperation(db, operation, options) {
    const [inFlight, setInFlight] = useState(0);
    const [pendingKeys, setPendingKeys] = useState(() => new Map());
    const [error, setError] = useState(undefined);
    const [errors, setErrors] = useState(() => new Map());
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const onErrorRef = useRef(options?.onError);
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
    }, [db, operation]);
    const pendingFor = useCallback((key) => (pendingKeys.get(key) ?? 0) > 0, [pendingKeys]);
    const errorFor = useCallback((key) => errors.get(key), [errors]);
    const clearError = useCallback(() => {
        setError(undefined);
        setErrors(new Map());
    }, []);
    const pending = inFlight > 0;
    return useMemo(() => ({ run, pending, pendingFor, error, errorFor, clearError }), [run, pending, pendingFor, error, errorFor, clearError]);
}
//# sourceMappingURL=useOperation.js.map