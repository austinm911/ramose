"use client";
import { queryAstKey } from "../db/astKey.js";
import { readT, } from "./read.js";
import { viewDep, viewKeyOf } from "./seam.js";
import { useOneShot } from "./useOneShot.js";
export function useQuery(db, query, options) {
    const astKey = queryAstKey(query);
    return useOneShot(() => db.query(query), () => readT(db), [viewDep(db), astKey], {
        initialData: options?.initialData,
        initialT: options?.initialT,
        suspense: options?.suspense,
        suspendKey: `one\0${viewKeyOf(db)}\0${astKey}`,
    });
}
//# sourceMappingURL=useQuery.js.map