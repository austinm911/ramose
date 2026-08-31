import type { InstalledCatalogUnitV2 } from "./catalog-unit.ts";
import type { AuthorizationPrincipal } from "./principal.ts";
import type { Datom } from "../core/datom.ts";
import type { Db, DatomPredicate } from "../core/db.ts";
import { type WireDatom } from "../core/log.ts";
export type ReadAuthorizationObservation = {
    readonly _tag: "type";
    readonly eid: number;
    readonly datoms: readonly WireDatom[];
} | {
    readonly _tag: "field";
    readonly eid: number;
    readonly ident: string;
    readonly attributeId: number | null;
    readonly datoms: readonly WireDatom[];
} | {
    readonly _tag: "exists";
    readonly eid: number;
    readonly value: boolean;
};
export type CompileReadFilterInput = {
    readonly unit: InstalledCatalogUnitV2;
    readonly principal: AuthorizationPrincipal;
    readonly currentDb: Db;
    readonly observe?: (observation: ReadAuthorizationObservation) => void;
};
export declare const uniqueCanonicalTypeName: (typeDatoms: readonly Datom[]) => string | undefined;
export declare const compileReadFilter: (input: CompileReadFilterInput) => DatomPredicate;
//# sourceMappingURL=read-filter.d.ts.map