"use client";
import { useContext, useEffect, useState } from "react";
import { RamoseContext } from "./context.js";
import { seamOf, viewDep } from "./seam.js";
const overlayOffline = (status) => {
    if (status === "closed")
        return status;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return "offline";
    }
    return status;
};
export function useConnectionStatus(db) {
    const ctx = useContext(RamoseContext);
    const client = ctx?.client ?? null;
    if (db === undefined && client === null) {
        throw new Error("useConnectionStatus: no <RamoseProvider> above this component. " +
            "Wrap your tree in <RamoseProvider url={…}> from \"ramose/react\" " +
            "or pass a db.");
    }
    const view = db === undefined ? undefined : viewDep(db);
    const read = () => {
        if (db !== undefined) {
            const seam = seamOf(db);
            return overlayOffline(seam?.status() ?? "offline");
        }
        return overlayOffline(client.connectionStatus());
    };
    const [status, setStatus] = useState(read);
    useEffect(() => {
        let disposed = false;
        const sync = () => {
            if (!disposed)
                setStatus(read());
        };
        sync();
        const offs = [];
        if (db !== undefined) {
            const off = seamOf(db)?.onWake(sync);
            if (off !== undefined)
                offs.push(off);
        }
        else if (client !== null) {
            offs.push(client.onConnectionStatus(sync));
        }
        if (typeof window !== "undefined") {
            window.addEventListener("online", sync);
            window.addEventListener("offline", sync);
            offs.push(() => {
                window.removeEventListener("online", sync);
                window.removeEventListener("offline", sync);
            });
        }
        return () => {
            disposed = true;
            for (const off of offs)
                off();
        };
        // read closes over db / client; view is the structural db identity
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, view]);
    return status;
}
//# sourceMappingURL=useConnectionStatus.js.map