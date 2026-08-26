"use client";
import { useEffect, useRef, useState } from "react";
import { seamOf, viewDep } from "./seam.js";
export const usePrincipal = (db, options) => {
    const view = viewDep(db);
    const [state, setState] = useState({
        eid: undefined,
        class: undefined,
        loading: true,
    });
    const onErrorRef = useRef(options?.onError);
    onErrorRef.current = options?.onError;
    useEffect(() => {
        let cancelled = false;
        const load = () => {
            void db.principal().then((who) => {
                if (cancelled)
                    return;
                setState({ eid: who.eid, class: who.class, loading: false });
            }, (error) => {
                if (cancelled)
                    return;
                onErrorRef.current?.(error);
                setState((prev) => ({ ...prev, loading: false }));
            });
        };
        setState((prev) => prev.loading ? prev : { eid: undefined, class: undefined, loading: true });
        load();
        let generation = seamOf(db)?.generation();
        const off = seamOf(db)?.onWake(() => {
            const next = seamOf(db)?.generation();
            if (next === generation)
                return;
            generation = next;
            load();
        });
        return () => {
            cancelled = true;
            off?.();
        };
        // load closes over db; view is the structural identity of the connection
    }, [view]);
    return state;
};
//# sourceMappingURL=usePrincipal.js.map