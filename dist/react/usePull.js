"use client";
import { pullPatternKey } from "../db/astKey.js";
import { readT, } from "./read.js";
import { seamOf, viewDep, viewKeyOf } from "./seam.js";
import { useLiveSubscription } from "./useLiveQuery.js";
import { useOneShot } from "./useOneShot.js";
/**
 * The subject, flattened to the coordinates the wire would see: `{ id }` to
 * the id, a lookup ref to `[ident, value]` whichever way its head is spelled.
 */
const subjectKey = (subject) => {
    if (Array.isArray(subject) && subject.length === 2) {
        const head = subject[0];
        const ident = typeof head === "object" && head !== null && "ident" in head
            ? head.ident
            : head;
        return JSON.stringify([ident, subject[1]]);
    }
    const id = subject?.id;
    return JSON.stringify(id ?? subject);
};
export function useLivePull(db, subject, pattern, options) {
    const view = viewDep(db);
    const key = subjectKey(subject);
    const astKey = pullPatternKey(pattern);
    return useLiveSubscription(() => ({
        sub: db.livePull(subject, pattern),
        owned: true,
    }), [view, key, astKey], [view, key, astKey], {
        initialData: options?.initialData,
        initialT: options?.initialT,
        suspense: options?.suspense,
        suspendKey: `live\0${viewKeyOf(db)}\0${key}\0${astKey}`,
        basis: () => readT(db),
        refetch: () => db.pull(subject, pattern),
        seam: {
            generation: () => seamOf(db)?.generation() ?? 0,
            status: () => seamOf(db)?.status() ?? "offline",
            onWake: (cb) => seamOf(db)?.onWake(cb),
        },
    });
}
export function usePull(db, subject, pattern, options) {
    const view = viewDep(db);
    const key = subjectKey(subject);
    const astKey = pullPatternKey(pattern);
    return useOneShot(() => db.pull(subject, pattern), () => readT(db), [view, key, astKey], {
        initialData: options?.initialData,
        initialT: options?.initialT,
        suspense: options?.suspense,
        suspendKey: `one\0${viewKeyOf(db)}\0${key}\0${astKey}`,
    });
}
//# sourceMappingURL=usePull.js.map