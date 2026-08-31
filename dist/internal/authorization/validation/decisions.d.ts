import * as Result from "effect/Result";
import type { RuleId } from "../identities.ts";
import type { CanonicalAuthorizationDecisions, CanonicalAuthorizationRule } from "../ir.ts";
import { type PreparedAuthorizationCatalog } from "./catalog.ts";
import { type ValidateFailure } from "./common.ts";
export declare const validateDecisions: (index: PreparedAuthorizationCatalog, decisions: CanonicalAuthorizationDecisions, rules: ReadonlyMap<RuleId, CanonicalAuthorizationRule>) => Result.Result<void, ValidateFailure>;
//# sourceMappingURL=decisions.d.ts.map