import * as Brand from "effect/Brand";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { CatalogDescriptor, EntityDescriptor, FieldDescriptor, OperationDescriptor, OperationInputShape, TraitComposition, TraitDescriptor, RuleAccessPlan, } from "./catalog.js";
import { canonicalizeInstalledCatalogUnit, decodeInstalledCatalogUnitResult, encodeInstalledCatalogUnit, hashCanonicalRule, hashCatalogSchemaFingerprint, hashInstalledAuthorization, hashInstalledCatalogUnit, } from "./decode.js";
import { CatalogMismatch, CatalogUnitCorrupt, InvalidIR } from "./failures.js";
import { CatalogId, CatalogUnitHash, CatalogVersion, DatabaseId, OperationId, SchemaFingerprint, } from "./identities.js";
import { BOUND_AUTHORIZATION_IR_VERSION, CanonicalAuthorizationDecisions, CanonicalAuthorizationRule, INSTALLED_AUTHORIZATION_IR_VERSION, InstalledAuthorizationIR, LegacyInstalledAuthorizationIRV1, } from "./ir.js";
import { normalizeAccessPlans, normalizeClasses, normalizeClaims, normalizeDecisions, normalizeEntities, normalizeFields, normalizeOperations, normalizeRules, normalizeTraitComposition, normalizeTraits, } from "./install/normalize.js";
import { ClaimDescriptor, ClassVocabulary } from "./principal.js";
import { deriveRuleAccessPlan } from "./install/plan.js";
import { validateBoundAuthorizationResult } from "./validate.js";
import { prepareAuthorizationCatalog } from "./validation/catalog.js";
import { invalid } from "./validation/common.js";
import { AUTHORIZATION_LANGUAGE_VERSION } from "./version.js";
import { canonicalizeJson } from "./canonical-json.js";
export const INSTALLED_CATALOG_UNIT_VERSION = 2;
export const InstalledCatalogUnitVersion = Schema.Literal(INSTALLED_CATALOG_UNIT_VERSION);
export const InstalledCatalogUnit = Schema.TaggedStruct("InstalledCatalogUnit", {
    version: InstalledCatalogUnitVersion,
    catalog: CatalogDescriptor,
    policy: InstalledAuthorizationIR,
    unitHash: CatalogUnitHash,
});
const LegacyOperationDescriptorV1 = Schema.Struct({
    id: OperationId,
    input: OperationInputShape,
});
const LegacyCatalogDescriptorV1 = Schema.Struct({
    id: CatalogId,
    database: DatabaseId,
    version: CatalogVersion,
    fingerprint: SchemaFingerprint,
    entities: Schema.Array(EntityDescriptor),
    traits: Schema.Array(TraitDescriptor),
    fields: Schema.Array(FieldDescriptor),
    operations: Schema.Array(LegacyOperationDescriptorV1),
    traitComposition: Schema.Array(TraitComposition),
});
export const LegacyInstalledCatalogUnitV1 = Schema.TaggedStruct("InstalledCatalogUnit", {
    version: Schema.Literal(1),
    catalog: LegacyCatalogDescriptorV1,
    policy: LegacyInstalledAuthorizationIRV1,
    unitHash: CatalogUnitHash,
});
const PLACEHOLDER_UNIT_HASH = CatalogUnitHash.make("0".repeat(64));
const verifiedInstalledCatalogUnit = Brand.nominal();
const clonePlain = (value) => {
    if (value === null || typeof value !== "object")
        return value;
    if (Array.isArray(value))
        return value.map((item) => clonePlain(item));
    const copy = {};
    for (const key of Object.keys(value)) {
        copy[key] = clonePlain(value[key]);
    }
    return copy;
};
const freezePlain = (value) => {
    if (value === null || typeof value !== "object" || Object.isFrozen(value))
        return value;
    if (Array.isArray(value)) {
        for (const item of value)
            freezePlain(item);
    }
    else {
        for (const key of Object.keys(value)) {
            freezePlain(value[key]);
        }
    }
    return Object.freeze(value);
};
const requireLanguageVersion = (version, label) => {
    if (version !== AUTHORIZATION_LANGUAGE_VERSION) {
        return invalid(`unsupported authorization language version in ${label}`);
    }
    return Result.succeed(undefined);
};
const encodedJson = (encoded) => encoded;
const canonicalEqual = (left, right, message) => {
    try {
        if (canonicalizeJson(encodedJson(left)) === canonicalizeJson(encodedJson(right))) {
            return Result.succeed(undefined);
        }
    }
    catch (cause) {
        return invalid(`ambiguous ${message}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    return Result.fail(new CatalogMismatch({ message }));
};
const catalogTableMismatch = (label) => `installed catalog ${label} do not match normalized catalog descriptor`;
const policyOrderMismatch = (label) => `installed policy ${label} are not in install-canonical order`;
const policyDerivedMismatch = (label) => `installed policy ${label} do not match re-derived policy tables`;
const requirePresent = (value, label) => {
    if (value === undefined || value === null) {
        return invalid(`missing ${label}`);
    }
    return Result.succeed(undefined);
};
const requireDescriptorTables = (descriptor) => Result.gen(function* () {
    yield* requirePresent(descriptor, "catalog descriptor");
    yield* requirePresent(descriptor.entities, "entities");
    yield* requirePresent(descriptor.traits, "traits");
    yield* requirePresent(descriptor.fields, "fields");
    yield* requirePresent(descriptor.operations, "operations");
    yield* requirePresent(descriptor.traitComposition, "traitComposition");
    if (!Array.isArray(descriptor.entities))
        return yield* invalid("missing entities");
    if (!Array.isArray(descriptor.traits))
        return yield* invalid("missing traits");
    if (!Array.isArray(descriptor.fields))
        return yield* invalid("missing fields");
    if (!Array.isArray(descriptor.operations))
        return yield* invalid("missing operations");
    if (!Array.isArray(descriptor.traitComposition)) {
        return yield* invalid("missing traitComposition");
    }
});
const requirePolicyPresent = (policy) => Result.gen(function* () {
    yield* requirePresent(policy, "installed policy");
    if (typeof policy !== "object")
        return yield* invalid("missing installed policy");
    yield* requirePresent(policy.accessPlans, "accessPlans");
    yield* requirePresent(policy.rules, "rules");
    yield* requirePresent(policy.decisions, "decisions");
    yield* requirePresent(policy.classes, "classes");
    yield* requirePresent(policy.claims, "claims");
});
const encodeEntities = (entities) => entities.map((entity) => Schema.encodeUnknownSync(EntityDescriptor)(entity));
const encodeTraits = (traits) => traits.map((trait) => Schema.encodeUnknownSync(TraitDescriptor)(trait));
const encodeFields = (fields) => fields.map((field) => Schema.encodeUnknownSync(FieldDescriptor)(field));
const encodeOperations = (operations) => operations.map((operation) => Schema.encodeUnknownSync(OperationDescriptor)(operation));
const encodeComposition = (rows) => rows.map((row) => Schema.encodeUnknownSync(TraitComposition)(row));
const encodeAccessPlans = (plans) => plans.map((plan) => Schema.encodeUnknownSync(RuleAccessPlan)(plan));
const encodeRules = (rules) => rules.map((rule) => Schema.encodeUnknownSync(CanonicalAuthorizationRule)(rule));
const encodeClasses = (classes) => Schema.encodeUnknownSync(ClassVocabulary)(classes);
const encodeClaims = (claims) => claims.map((claim) => Schema.encodeUnknownSync(ClaimDescriptor)(claim));
const encodeDecisions = (decisions) => Schema.encodeUnknownSync(CanonicalAuthorizationDecisions)(decisions);
const catalogBindingTarget = (catalog) => ({
    database: catalog.database,
    catalog: catalog.id,
    catalogVersion: catalog.version,
    schemaFingerprint: catalog.fingerprint,
});
const boundAuthorizationFromPolicy = (catalog, policy) => ({
    _tag: "BoundAuthorizationIR",
    version: BOUND_AUTHORIZATION_IR_VERSION,
    languageVersion: policy.languageVersion,
    database: catalog.database,
    catalog: catalog.id,
    catalogVersion: catalog.version,
    schemaFingerprint: catalog.fingerprint,
    classes: policy.classes,
    claims: policy.claims,
    principal: policy.principal,
    rules: policy.rules,
    decisions: policy.decisions,
});
const normalizeCatalogDescriptor = (descriptor) => Result.gen(function* () {
    yield* requireDescriptorTables(descriptor);
    const [entities, traits, fields, operations, traitComposition] = yield* Result.all([
        normalizeEntities(descriptor.entities),
        normalizeTraits(descriptor.traits),
        normalizeFields(descriptor.fields),
        normalizeOperations(descriptor.operations),
        normalizeTraitComposition(descriptor.traitComposition),
    ]);
    return {
        id: descriptor.id,
        database: descriptor.database,
        version: descriptor.version,
        fingerprint: descriptor.fingerprint,
        entities,
        traits,
        fields,
        operations,
        traitComposition,
    };
});
const requireCatalogAlreadyCanonical = (catalog, normalized) => Result.gen(function* () {
    yield* canonicalEqual(encodeEntities(normalized.entities), encodeEntities(catalog.entities), catalogTableMismatch("entities"));
    yield* canonicalEqual(encodeTraits(normalized.traits), encodeTraits(catalog.traits), catalogTableMismatch("traits"));
    yield* canonicalEqual(encodeFields(normalized.fields), encodeFields(catalog.fields), catalogTableMismatch("fields"));
    yield* canonicalEqual(encodeOperations(normalized.operations), encodeOperations(catalog.operations), catalogTableMismatch("operations"));
    yield* canonicalEqual(encodeComposition(normalized.traitComposition), encodeComposition(catalog.traitComposition), catalogTableMismatch("traitComposition"));
});
const requirePolicyReferences = (catalog, policy) => Result.gen(function* () {
    const index = yield* prepareAuthorizationCatalog(catalogBindingTarget(catalog), catalog);
    const validated = yield* validateBoundAuthorizationResult({
        bound: boundAuthorizationFromPolicy(catalog, policy),
        descriptor: catalog,
    });
    const rules = yield* normalizeRules(validated.rules);
    yield* canonicalEqual(encodeRules(rules), encodeRules(policy.rules), policyOrderMismatch("rules"));
    const classes = yield* normalizeClasses(policy.classes);
    yield* canonicalEqual(encodeClasses(classes), encodeClasses(policy.classes), policyOrderMismatch("classes"));
    const claims = yield* normalizeClaims(policy.claims);
    yield* canonicalEqual(encodeClaims(claims), encodeClaims(policy.claims), policyOrderMismatch("claims"));
    const decisions = yield* normalizeDecisions(policy.decisions);
    yield* canonicalEqual(encodeDecisions(decisions), encodeDecisions(policy.decisions), policyOrderMismatch("decisions"));
    const derived = [];
    for (const rule of policy.rules) {
        const plan = yield* deriveRuleAccessPlan(index, rule, policy.principal);
        derived.push(plan);
    }
    const accessPlans = yield* normalizeAccessPlans(derived, policy.rules);
    yield* canonicalEqual(encodeAccessPlans(accessPlans), encodeAccessPlans(policy.accessPlans), policyDerivedMismatch("accessPlans"));
});
export const normalizeAndValidateCatalogUnit = (catalog, policy, version = INSTALLED_CATALOG_UNIT_VERSION, options = {}) => Result.gen(function* () {
    yield* requireDescriptorTables(catalog);
    yield* requirePolicyPresent(policy);
    if (version !== INSTALLED_CATALOG_UNIT_VERSION) {
        return yield* invalid("unsupported catalog unit version");
    }
    if (policy.version !== INSTALLED_AUTHORIZATION_IR_VERSION) {
        return yield* invalid("unsupported installed policy version");
    }
    yield* requireLanguageVersion(policy.languageVersion, "embedded policy");
    const normalized = yield* normalizeCatalogDescriptor(catalog);
    yield* requirePolicyReferences(normalized, policy);
    if (options.requireCatalogAlreadyCanonical === true) {
        yield* requireCatalogAlreadyCanonical(catalog, normalized);
    }
    return freezePlain({
        version: INSTALLED_CATALOG_UNIT_VERSION,
        catalog: freezePlain(clonePlain(normalized)),
        policy: freezePlain(clonePlain(policy)),
    });
});
export const assembleInstalledCatalogUnit = (descriptor, policy) => Result.gen(function* () {
    const descriptorSnapshot = freezePlain(clonePlain(descriptor));
    const policySnapshot = freezePlain(clonePlain(policy));
    return yield* normalizeAndValidateCatalogUnit(descriptorSnapshot, policySnapshot, INSTALLED_CATALOG_UNIT_VERSION);
});
const requireBoundSchemaFingerprint = Effect.fn("Authorization.requireBoundSchemaFingerprint")(function* (catalog) {
    const digest = yield* hashCatalogSchemaFingerprint(catalog);
    if (digest !== catalog.fingerprint) {
        return yield* new CatalogMismatch({
            message: "schema fingerprint does not match catalog tables",
            expectedFingerprint: digest,
            actualFingerprint: catalog.fingerprint,
        });
    }
});
const requireEmbeddedPolicyHashes = Effect.fn("Authorization.requireEmbeddedPolicyHashes")(function* (policy, catalogId) {
    const policyHash = yield* hashInstalledAuthorization(policy);
    if (policyHash !== policy.policyHash) {
        return yield* new CatalogUnitCorrupt({
            message: "installed policy hash mismatch",
            catalog: catalogId,
        });
    }
    for (const rule of policy.rules) {
        const id = yield* hashCanonicalRule(rule);
        if (id !== rule.id) {
            return yield* new CatalogUnitCorrupt({
                message: "catalog unit rule hash mismatch",
                catalog: catalogId,
            });
        }
    }
});
const requireCatalogUnitDigests = Effect.fn("Authorization.requireCatalogUnitDigests")(function* (tables) {
    yield* requireBoundSchemaFingerprint(tables.catalog);
    yield* requireEmbeddedPolicyHashes(tables.policy, tables.catalog.id);
});
export const sealInstalledCatalogUnit = Effect.fn("Authorization.sealInstalledCatalogUnit")(function* (descriptor, policy) {
    const tables = yield* Effect.fromResult(assembleInstalledCatalogUnit(descriptor, policy));
    const snapshot = freezePlain(clonePlain(tables));
    yield* requireCatalogUnitDigests(snapshot);
    const hashingDocument = {
        _tag: "InstalledCatalogUnit",
        ...snapshot,
        unitHash: PLACEHOLDER_UNIT_HASH,
    };
    const unitHash = yield* hashInstalledCatalogUnit(hashingDocument);
    const assembled = {
        _tag: "InstalledCatalogUnit",
        ...snapshot,
        unitHash,
    };
    const decoded = yield* Effect.fromResult(decodeInstalledCatalogUnitResult(encodeInstalledCatalogUnit(assembled)));
    return verifiedInstalledCatalogUnit(freezePlain(clonePlain(decoded)));
});
export const verifyInstalledCatalogUnit = Effect.fn("Authorization.verifyInstalledCatalogUnit")(function* (document) {
    const snapshot = freezePlain(clonePlain(document));
    const tables = yield* Effect.fromResult(normalizeAndValidateCatalogUnit(snapshot.catalog, snapshot.policy, snapshot.version, {
        requireCatalogAlreadyCanonical: true,
    }));
    yield* requireCatalogUnitDigests(tables);
    const digest = yield* hashInstalledCatalogUnit(snapshot);
    if (digest !== snapshot.unitHash) {
        return yield* new CatalogUnitCorrupt({
            message: "catalog unit hash mismatch",
            catalog: snapshot.catalog.id,
        });
    }
    const decoded = yield* Effect.fromResult(decodeInstalledCatalogUnitResult(encodeInstalledCatalogUnit(snapshot)));
    return verifiedInstalledCatalogUnit(freezePlain(clonePlain(decoded)));
});
export const catalogUnitCanonicalBytes = (document) => new TextEncoder().encode(canonicalizeInstalledCatalogUnit(document));
//# sourceMappingURL=catalog-unit.js.map