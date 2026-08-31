import type { OperationDescriptor } from "./catalog.ts";
import type { CanonicalValueTerm } from "./expr.ts";
import type { InstalledCatalogUnitV2 } from "./catalog-unit.ts";
import type { AuthenticatedCaller } from "./request.ts";
export type PrincipalProjection = {
    readonly _tag: "present";
    readonly value: unknown;
} | {
    readonly _tag: "absent";
} | {
    readonly _tag: "invalid";
};
export declare const principalValuesEqual: (left: unknown, right: unknown) => boolean;
export declare const projectPrincipalTerm: (term: CanonicalValueTerm, caller: AuthenticatedCaller, subject: string) => PrincipalProjection;
export declare const operationGrantAllows: (unit: InstalledCatalogUnitV2, descriptor: OperationDescriptor, caller: AuthenticatedCaller, subject: string) => boolean;
//# sourceMappingURL=operation-grant.d.ts.map