import * as Result from "effect/Result";
import type { CanonicalRefTerm, CanonicalValueTerm } from "../expr.ts";
import type { EntityId } from "../identities.ts";
import type { CanonicalRuleFocus } from "../ir.ts";
import type { ClaimDescriptor, InstalledPrincipalResolution } from "../principal.ts";
import { type PreparedAuthorizationCatalog, type RowFocus } from "./catalog.ts";
import { type ValidationLimits, type ValidateFailure } from "./common.ts";
import { type Derived, type StaticWork, type TermShape } from "./types.ts";
export declare const resourceFocus: (index: PreparedAuthorizationCatalog, focus: CanonicalRuleFocus) => Result.Result<RowFocus, ValidateFailure>;
export declare const meEntity: (index: PreparedAuthorizationCatalog, principal: InstalledPrincipalResolution) => Result.Result<EntityId | undefined, ValidateFailure>;
export declare const walkRef: (index: PreparedAuthorizationCatalog, term: CanonicalRefTerm, resource: RowFocus, me: EntityId | undefined, limits: ValidationLimits, spent: StaticWork) => Result.Result<{
    readonly shape: TermShape;
    readonly derived: Derived;
}, ValidateFailure>;
export declare const walkValue: (index: PreparedAuthorizationCatalog, term: CanonicalValueTerm, resource: RowFocus, me: EntityId | undefined, claims: ReadonlyArray<ClaimDescriptor>, limits: ValidationLimits, spent: StaticWork) => Result.Result<{
    readonly shape: TermShape;
    readonly derived: Derived;
}, ValidateFailure>;
//# sourceMappingURL=traversal.d.ts.map