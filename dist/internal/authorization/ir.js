import * as Schema from "effect/Schema";
import { CatalogDescriptor, RuleAccessPlan } from "./catalog.js";
import { CanonicalAuthorizationExpr, RelativeAuthorizationExpr } from "./expr.js";
import { CanonicalIdentitySchemas, CatalogId, CatalogVersion, DatabaseId, PolicyHash, RelativeIdentitySchemas, RuleId, SchemaFingerprint, } from "./identities.js";
import { ClaimVocabulary, ClassVocabulary, InstalledPrincipalResolution, PrincipalResolutionConfig, } from "./principal.js";
import { AuthorizationLanguageVersion } from "./version.js";
export const POLICY_TEMPLATE_IR_VERSION = 2;
export const BOUND_AUTHORIZATION_IR_VERSION = 2;
export const VALIDATED_AUTHORIZATION_IR_VERSION = 2;
export const INSTALLED_AUTHORIZATION_IR_VERSION = 2;
export const PolicyTemplateIRVersion = Schema.Literal(POLICY_TEMPLATE_IR_VERSION);
export const BoundAuthorizationIRVersion = Schema.Literal(BOUND_AUTHORIZATION_IR_VERSION);
export const ValidatedAuthorizationIRVersion = Schema.Literal(VALIDATED_AUTHORIZATION_IR_VERSION);
export const InstalledAuthorizationIRVersion = Schema.Literal(INSTALLED_AUTHORIZATION_IR_VERSION);
export const RuleFocus = (ids) => Schema.Union([
    Schema.TaggedStruct("entity", { entity: ids.entity }),
    Schema.TaggedStruct("trait", { trait: ids.trait }),
    Schema.TaggedStruct("field", { field: ids.field }),
    Schema.TaggedStruct("operation", { operation: ids.operation }),
]);
export const AuthorizationRule = (ids, expr) => Schema.Struct({
    id: RuleId,
    focus: RuleFocus(ids),
    expr,
    usesResource: Schema.Boolean,
    usesMe: Schema.Boolean,
    usesSubject: Schema.Boolean,
    traversalDepth: Schema.Natural,
});
export const Decision = Schema.Struct({
    allow: Schema.Array(RuleId),
    deny: Schema.Array(RuleId),
});
export const DecisionEntry = (target) => Schema.Struct({
    target,
    decision: Decision,
});
export const AuthorizationDecisions = (ids) => Schema.Struct({
    entities: Schema.Array(DecisionEntry(ids.entity)),
    traits: Schema.Array(DecisionEntry(ids.trait)),
    fields: Schema.Array(DecisionEntry(ids.field)),
    operations: Schema.Array(DecisionEntry(ids.operation)),
});
export const PolicyTemplateIR = Schema.TaggedStruct("PolicyTemplateIR", {
    version: PolicyTemplateIRVersion,
    languageVersion: AuthorizationLanguageVersion,
    classes: ClassVocabulary,
    claims: ClaimVocabulary,
    principal: PrincipalResolutionConfig,
    rules: Schema.Array(AuthorizationRule(RelativeIdentitySchemas, RelativeAuthorizationExpr)),
    decisions: AuthorizationDecisions(RelativeIdentitySchemas),
});
export const BoundAuthorizationIR = Schema.TaggedStruct("BoundAuthorizationIR", {
    version: BoundAuthorizationIRVersion,
    languageVersion: AuthorizationLanguageVersion,
    database: DatabaseId,
    catalog: CatalogId,
    catalogVersion: CatalogVersion,
    schemaFingerprint: SchemaFingerprint,
    classes: ClassVocabulary,
    claims: ClaimVocabulary,
    principal: InstalledPrincipalResolution,
    rules: Schema.Array(AuthorizationRule(CanonicalIdentitySchemas, CanonicalAuthorizationExpr)),
    decisions: AuthorizationDecisions(CanonicalIdentitySchemas),
});
export const ValidatedAuthorizationIR = Schema.TaggedStruct("ValidatedAuthorizationIR", {
    version: ValidatedAuthorizationIRVersion,
    languageVersion: AuthorizationLanguageVersion,
    database: DatabaseId,
    catalog: CatalogId,
    catalogVersion: CatalogVersion,
    schemaFingerprint: SchemaFingerprint,
    classes: ClassVocabulary,
    claims: ClaimVocabulary,
    principal: InstalledPrincipalResolution,
    rules: Schema.Array(AuthorizationRule(CanonicalIdentitySchemas, CanonicalAuthorizationExpr)),
    decisions: AuthorizationDecisions(CanonicalIdentitySchemas),
});
export const AuthorizationValidationInput = Schema.Struct({
    bound: BoundAuthorizationIR,
    descriptor: CatalogDescriptor,
});
export const InstalledAuthorizationIR = Schema.TaggedStruct("InstalledAuthorizationIR", {
    version: InstalledAuthorizationIRVersion,
    languageVersion: AuthorizationLanguageVersion,
    policyHash: PolicyHash,
    classes: ClassVocabulary,
    claims: ClaimVocabulary,
    principal: InstalledPrincipalResolution,
    rules: Schema.Array(AuthorizationRule(CanonicalIdentitySchemas, CanonicalAuthorizationExpr)),
    decisions: AuthorizationDecisions(CanonicalIdentitySchemas),
    accessPlans: Schema.Array(RuleAccessPlan),
});
const LegacyCanonicalIdentitySchemasV1 = {
    ...CanonicalIdentitySchemas,
    operation: Schema.Never,
};
const LegacyAuthorizationDecisionsV1 = Schema.Struct({
    entities: Schema.Array(DecisionEntry(CanonicalIdentitySchemas.entity)),
    traits: Schema.Array(DecisionEntry(CanonicalIdentitySchemas.trait)),
    fields: Schema.Array(DecisionEntry(CanonicalIdentitySchemas.field)),
});
export const LegacyInstalledAuthorizationIRV1 = Schema.TaggedStruct("InstalledAuthorizationIR", {
    version: Schema.Literal(1),
    languageVersion: AuthorizationLanguageVersion,
    policyHash: PolicyHash,
    classes: ClassVocabulary,
    claims: ClaimVocabulary,
    principal: InstalledPrincipalResolution,
    rules: Schema.Array(AuthorizationRule(LegacyCanonicalIdentitySchemasV1, CanonicalAuthorizationExpr)),
    decisions: LegacyAuthorizationDecisionsV1,
    accessPlans: Schema.Array(RuleAccessPlan),
});
export const CatalogBindingTarget = Schema.Struct({
    database: DatabaseId,
    catalog: CatalogId,
    catalogVersion: CatalogVersion,
    schemaFingerprint: SchemaFingerprint,
});
export const CatalogBindingInput = Schema.Struct({
    target: CatalogBindingTarget,
    descriptor: CatalogDescriptor,
    template: PolicyTemplateIR,
});
export const RelativeRuleFocus = RuleFocus(RelativeIdentitySchemas);
export const CanonicalRuleFocus = RuleFocus(CanonicalIdentitySchemas);
export const RelativeAuthorizationRule = AuthorizationRule(RelativeIdentitySchemas, RelativeAuthorizationExpr);
export const CanonicalAuthorizationRule = AuthorizationRule(CanonicalIdentitySchemas, CanonicalAuthorizationExpr);
export const RelativeAuthorizationDecisions = AuthorizationDecisions(RelativeIdentitySchemas);
export const CanonicalAuthorizationDecisions = AuthorizationDecisions(CanonicalIdentitySchemas);
//# sourceMappingURL=ir.js.map