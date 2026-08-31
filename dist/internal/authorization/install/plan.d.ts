import * as Result from "effect/Result";
import { type RuleAccessPlan } from "../catalog.ts";
import type { CanonicalAuthorizationRule } from "../ir.ts";
import type { InstalledPrincipalResolution } from "../principal.ts";
import { type PreparedAuthorizationCatalog } from "../validation/catalog.ts";
import { type ValidateFailure } from "../validation/common.ts";
export declare const deriveRuleAccessPlan: (index: PreparedAuthorizationCatalog, rule: CanonicalAuthorizationRule, principal: InstalledPrincipalResolution) => Result.Result<RuleAccessPlan, ValidateFailure>;
//# sourceMappingURL=plan.d.ts.map