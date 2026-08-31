import * as Result from "effect/Result";
import type { CanonicalAuthorizationExpr } from "../expr.ts";
import type { EntityId } from "../identities.ts";
import type { CanonicalAuthorizationRule } from "../ir.ts";
import type { ClaimDescriptor, InstalledPrincipalResolution } from "../principal.ts";
import { type PreparedAuthorizationCatalog, type RowFocus } from "./catalog.ts";
import { type ValidationLimits, type ValidateFailure } from "./common.ts";
import { type Derived, type StaticWork } from "./types.ts";
export declare const walkExpr: (index: PreparedAuthorizationCatalog, expr: CanonicalAuthorizationExpr, resource: RowFocus, me: EntityId | undefined, classes: ReadonlySet<string>, claims: ReadonlyArray<ClaimDescriptor>, limits: ValidationLimits, spent: StaticWork) => Result.Result<Derived, ValidateFailure>;
export declare const validateRule: (index: PreparedAuthorizationCatalog, rule: CanonicalAuthorizationRule, principal: InstalledPrincipalResolution, classes: ReadonlySet<string>, claims: ReadonlyArray<ClaimDescriptor>, limits: ValidationLimits) => Result.Result<CanonicalAuthorizationRule, ValidateFailure>;
//# sourceMappingURL=expression.d.ts.map