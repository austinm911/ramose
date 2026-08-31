import * as Brand from "effect/Brand";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { AuthoritativeCatalog, bindPolicyTemplate, } from "./bind.js";
import { decodeInstalledAuthorizationResult, encodeInstalledAuthorization, hashInstalledAuthorization, } from "./decode.js";
import { PolicyHash } from "./identities.js";
import { INSTALLED_AUTHORIZATION_IR_VERSION, } from "./ir.js";
import { validateBoundAuthorization } from "./validate.js";
import { AUTHORIZATION_LANGUAGE_VERSION } from "./version.js";
import { normalizeValidatedTables } from "./install/normalize.js";
import { deriveRuleAccessPlan } from "./install/plan.js";
import { prepareAuthorizationCatalog } from "./validation/catalog.js";
import { invalid } from "./validation/common.js";
const PLACEHOLDER_POLICY_HASH = PolicyHash.make("0".repeat(64));
const verifiedInstalledAuthorization = Brand.nominal();
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
const assembleUnhashedTables = (validated, descriptor) => Result.gen(function* () {
    yield* requireLanguageVersion(validated.languageVersion, "validated IR");
    const index = yield* prepareAuthorizationCatalog({
        database: validated.database,
        catalog: validated.catalog,
        catalogVersion: validated.catalogVersion,
        schemaFingerprint: validated.schemaFingerprint,
    }, descriptor);
    const plans = [];
    for (const rule of validated.rules) {
        const plan = yield* deriveRuleAccessPlan(index, rule, validated.principal);
        plans.push(plan);
    }
    const tables = yield* normalizeValidatedTables(validated, plans);
    return {
        version: INSTALLED_AUTHORIZATION_IR_VERSION,
        languageVersion: AUTHORIZATION_LANGUAGE_VERSION,
        classes: tables.classes,
        claims: tables.claims,
        principal: validated.principal,
        rules: tables.rules,
        decisions: tables.decisions,
        accessPlans: tables.accessPlans,
    };
});
const sealInstalledAuthorization = Effect.fn("Authorization.sealInstalledAuthorization")(function* (validated, descriptor) {
    const tables = yield* Effect.fromResult(assembleUnhashedTables(validated, descriptor));
    const hashingDocument = {
        _tag: "InstalledAuthorizationIR",
        ...tables,
        policyHash: PLACEHOLDER_POLICY_HASH,
    };
    const policyHash = yield* hashInstalledAuthorization(hashingDocument);
    const installed = {
        _tag: "InstalledAuthorizationIR",
        ...clonePlain(tables),
        policyHash,
    };
    const decoded = yield* Effect.fromResult(decodeInstalledAuthorizationResult(encodeInstalledAuthorization(installed)));
    return verifiedInstalledAuthorization(freezePlain(clonePlain(decoded)));
});
export const installAuthorization = Effect.fn("Authorization.installAuthorization")(function* (input) {
    yield* Effect.fromResult(requireLanguageVersion(input.template.languageVersion, "policy template"));
    const bound = yield* bindPolicyTemplate(input);
    yield* Effect.fromResult(requireLanguageVersion(bound.languageVersion, "bound IR"));
    const validated = yield* validateBoundAuthorization({
        bound,
        descriptor: input.descriptor,
    });
    return yield* sealInstalledAuthorization(validated, input.descriptor);
});
export const installAgainstAuthoritativeCatalog = Effect.fn("Authorization.installAgainstAuthoritativeCatalog")(function* (target, template) {
    const catalogs = yield* AuthoritativeCatalog;
    const descriptor = yield* catalogs.resolve(target);
    return yield* installAuthorization({ target, descriptor, template });
});
//# sourceMappingURL=install.js.map