"use client";
import { useEffect, useState } from "react";
import { readT } from "./read.js";
import { seamOf, viewDep } from "./seam.js";
export const useBasis = (db) => {
    const view = viewDep(db);
    const [t, setT] = useState(() => readT(db));
    useEffect(() => {
        const pinned = seamOf(db)?.asOf;
        if (pinned !== undefined) {
            setT(pinned);
            return;
        }
        let disposed = false;
        const sync = () => {
            if (!disposed)
                setT(readT(db));
        };
        sync();
        const off = seamOf(db)?.onWake(() => {
            queueMicrotask(sync);
        });
        // No session (HTTPS-only, or the socket is not open yet): one
        // authoritative `/info`. Later wakes — once a sibling opens the
        // session — still land through `onWake` + `session.t`.
        if (readT(db) === undefined) {
            void db
                .basis()
                .then((basis) => {
                if (!disposed)
                    setT(readT(db) ?? basis.t);
            })
                .catch(() => {
                if (!disposed)
                    setT((prev) => readT(db) ?? prev);
            });
        }
        return () => {
            disposed = true;
            off?.();
        };
    }, [view]);
    return t;
};
//# sourceMappingURL=useBasis.js.map