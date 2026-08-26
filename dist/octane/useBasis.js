/**
 * `useBasis` — where the database's basis is. A live view reads
 * `session.t` synchronously and again on every session wake (a `{ op:
 * "tx" }` / resync, a local write, a reconnect) — no `GET /info` per
 * tick. An `asOf(t)` view answers `t` on the first render, with no
 * request. An HTTPS-only client has no session to wake: one `db.basis()`
 * so a useBasis-only tree still learns the peer's t. `undefined` until
 * the first answer lands.
 */
import { useEffect, useState } from "octane";
import { readT } from "../react/read.js";
import { seamOf, viewDep } from "../react/seam.js";
import { splitSlot, subSlot } from "./internal.js";
export function useBasis(db, ...rest) {
    const [, slot] = splitSlot(rest);
    const view = viewDep(db);
    const [t, setT] = useState(() => readT(db), subSlot(slot, "basis:state"));
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
    }, [view], subSlot(slot, "basis:effect"));
    return t;
}
//# sourceMappingURL=useBasis.js.map